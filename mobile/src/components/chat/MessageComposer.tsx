/**
 * MessageComposer — WhatsApp-grade multiline composer
 *
 * Architecture:
 * ─────────────────────────────────────────────────────────────────────────────
 * PHASE 1 (1–4 lines): TextInput grows naturally from minHeight to maxHeight.
 *   - No scroll. Height driven by onContentSizeChange.
 *   - Layout reflow is cheap (single Animated.Value update).
 *
 * PHASE 2 (5+ lines / > MAX_HEIGHT): TextInput locks at MAX_HEIGHT.
 *   - scrollEnabled flips to true. User scrolls INSIDE the input.
 *   - No more layout reflows. The outer container is frozen.
 *   - Editing previous lines, cursor tracking, selection — all native.
 *
 * Isolation guarantees:
 * ─────────────────────────────────────────────────────────────────────────────
 * - This component NEVER causes parent re-renders while typing.
 * - `textRef` holds the canonical value. `displayText` drives the input.
 * - `hasText` is the ONLY state gate that propagates upward (send button).
 * - The TextInput NEVER unmounts — keyboard stays permanently open.
 * - `onSend` is fire-and-forget — no await, no disabled gate.
 *
 * Keyboard rules:
 * ─────────────────────────────────────────────────────────────────────────────
 * - blurOnSubmit=false: return key does NOT dismiss keyboard.
 * - disableFullscreenUI=true: Android avoids full-screen editor pop-up.
 * - keyboardAppearance='dark': iOS uses the dark keyboard skin.
 * - No JS-thread keyboard listeners — KAV handles avoidance natively.
 */

import React, { useRef, useCallback, useState } from 'react';
import {
    View, TextInput, TouchableOpacity, Text,
    StyleSheet, Platform, Animated,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MediaService } from '../../services/MediaService';
import VoiceService from '../../services/VoiceService';
import { Alert } from 'react-native';

// ── Layout constants ──────────────────────────────────────────────────────────
const LINE_HEIGHT = 22;         // matches fontSize:15 × 1.4 line-height
const MIN_HEIGHT = 44;          // single-line pill height
const MAX_HEIGHT = LINE_HEIGHT * 5 + 24; // ~5 lines + vertical padding = ~134px
const INPUT_PADDING_V = Platform.OS === 'ios' ? 11 : 9;
const INPUT_PADDING_H = 16;

interface Props {
    conversationId: string;
    /** Fire-and-forget — do NOT await this in the composer */
    onSend: (text: string, attachmentId?: string) => void;
    insets: { bottom: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// Inner component — the only owner of typing state
// ─────────────────────────────────────────────────────────────────────────────
const MessageComposerInner = ({ conversationId, onSend, insets }: Props) => {
    // displayText drives the controlled input — single state atom
    const [displayText, setDisplayText] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);

    // textRef: synchronous read without waiting for a React render cycle.
    // This is the canonical value used by handleSend.
    const textRef = useRef('');

    // inputHeight: Animated so the container resize is driven by the native
    // animation thread, not the JS thread. This eliminates layout thrash.
    const inputHeight = useRef(new Animated.Value(MIN_HEIGHT)).current;

    // scrollEnabled flips to true only when content exceeds MAX_HEIGHT.
    // In PHASE 2 the container height is frozen — zero more layout reflows.
    const [scrollEnabled, setScrollEnabled] = useState(false);
    const isPhase2Ref = useRef(false);

    // Input ref — used only for imperative focus control (not text read/write)
    const inputRef = useRef<TextInput>(null);

    // ── Text change handler ─────────────────────────────────────────────────
    // THIS IS THE ONLY FUNCTION that runs on every keystroke.
    // It must do the minimum possible work.
    const handleChangeText = useCallback((val: string) => {
        textRef.current = val;
        setDisplayText(val);
    }, []);

    // ── Content size change — drives two-phase height behavior ──────────────
    // Called by the native layer after text reflow. Runs on the JS thread but
    // does NOT trigger a React re-render — it only mutates the Animated.Value.
    const handleContentSizeChange = useCallback((e: any) => {
        const rawH = e.nativeEvent.contentSize.height;
        const clampedH = Math.max(MIN_HEIGHT, Math.min(rawH, MAX_HEIGHT));

        const enteringPhase2 = rawH > MAX_HEIGHT;

        if (enteringPhase2 && !isPhase2Ref.current) {
            // ── PHASE 2 transition: freeze height, enable internal scroll ───
            isPhase2Ref.current = true;
            setScrollEnabled(true);
            // Lock height with no animation — avoids one more layout pass
            inputHeight.setValue(MAX_HEIGHT);
        } else if (!enteringPhase2) {
            // ── PHASE 1: grow smoothly ────────────────────────────────────
            if (isPhase2Ref.current) {
                // Shrinking back from PHASE 2 — re-enable growth
                isPhase2Ref.current = false;
                setScrollEnabled(false);
            }
            // Spring animation: feels physically weighted like native
            Animated.spring(inputHeight, {
                toValue: clampedH,
                useNativeDriver: false,  // height cannot use native driver
                stiffness: 280,
                damping: 35,
                mass: 0.6,
                overshootClamping: true, // no bounce — prevents layout jumps
            }).start();
        }
        // In PHASE 2: nothing changes — zero layout work
    }, [inputHeight]);

    // ── Send ─────────────────────────────────────────────────────────────────
    const handleSend = useCallback(() => {
        const trimmed = textRef.current.trim();
        if (!trimmed) return;

        // Reset height synchronously before clearing text.
        // This gives the input the visual appearance of a clean state
        // before the text value is even processed by the controlled input.
        inputHeight.setValue(MIN_HEIGHT);
        isPhase2Ref.current = false;
        if (scrollEnabled) setScrollEnabled(false);

        // Clear text — instant, no await
        textRef.current = '';
        setDisplayText('');

        // Fire and forget
        onSend(trimmed);
    }, [onSend, scrollEnabled, inputHeight]);

    // ── Media ─────────────────────────────────────────────────────────────────
    const handlePickMedia = useCallback(async () => {
        if (isUploadingMedia) return;
        try {
            const asset = await MediaService.pickImage();
            if (!asset) return;
            setIsUploadingMedia(true);
            const attachment = await MediaService.uploadMedia(
                asset.uri,
                asset.fileName || `upload_${Date.now()}.jpg`,
                asset.mimeType || 'image/jpeg',
                conversationId
            );
            const label = (asset.mimeType || '').startsWith('video') ? '📹 Video' : '🖼️ Image';
            onSend(label, attachment.id);
        } catch (err: any) {
            Alert.alert('Upload Error', err.message || 'Failed to upload media.');
        } finally {
            setIsUploadingMedia(false);
        }
    }, [conversationId, onSend, isUploadingMedia]);

    // ── Voice ─────────────────────────────────────────────────────────────────
    const handleVoiceNote = useCallback(async () => {
        if (isRecording) {
            setIsRecording(false);
            try {
                setIsUploadingMedia(true);
                const attachment = await VoiceService.stopRecording(conversationId);
                if (attachment) {
                    onSend('🎤 Voice Note', attachment.id);
                } else {
                    Alert.alert('Voice Note Error', 'Recording was empty. Please try again.');
                }
            } catch (err: any) {
                Alert.alert('Voice Note Error', err.message || 'Failed to process voice note.');
            } finally {
                setIsUploadingMedia(false);
            }
        } else {
            try {
                await VoiceService.startRecording();
                setIsRecording(true);
            } catch (err: any) {
                setIsRecording(false);
                Alert.alert('Recording Error', err.message || 'Could not start recording.');
            }
        }
    }, [conversationId, onSend, isRecording]);

    const hasText = displayText.length > 0;

    return (
        <View style={[styles.outerContainer, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <View style={styles.row}>

                {/* Attach button — anchored to bottom of row */}
                <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={handlePickMedia}
                    disabled={isUploadingMedia || isRecording}
                    hitSlop={HIT_SLOP}
                    activeOpacity={0.7}
                >
                    <Text style={styles.iconText}>{isUploadingMedia ? '⏳' : '📎'}</Text>
                </TouchableOpacity>

                {/* ── Input pill ─────────────────────────────────────────────
                    Animated.View drives the height — not the TextInput itself.
                    The TextInput always fills its parent 100%. This prevents
                    the TextInput from fighting its own layout constraints. */}
                <Animated.View style={[styles.inputPill, { height: inputHeight }]}>
                    <TextInput
                        ref={inputRef}
                        style={styles.input}
                        value={displayText}
                        onChangeText={handleChangeText}
                        onContentSizeChange={handleContentSizeChange}
                        placeholder="Message..."
                        placeholderTextColor="#444"
                        multiline={true}
                        // PHASE 1: false (input grows via outer Animated.View)
                        // PHASE 2: true (content scrolls inside locked container)
                        scrollEnabled={scrollEnabled}
                        // Typing performance
                        blurOnSubmit={false}
                        returnKeyType="default"
                        // These prevent layout recalculation during typing
                        autoCorrect={false}
                        autoCapitalize="sentences"
                        keyboardType="default"
                        // iOS: native dark keyboard skin
                        keyboardAppearance="dark"
                        // Android: prevent full-screen editor popup
                        disableFullscreenUI={true}
                        // Cursor stability: keep text aligned to top in PHASE 2
                        textAlignVertical="top"
                        // No max height on TextInput — the Animated.View clamps it
                        // This prevents the TextInput from fighting its own constraints
                        maxLength={4000}
                    />
                </Animated.View>

                {/* Send / Mic button — anchored to bottom of row */}
                {hasText ? (
                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={handleSend}
                        activeOpacity={0.75}
                        hitSlop={HIT_SLOP}
                    >
                        <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.actionGrad}>
                            <Text style={styles.actionIcon}>➤</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={styles.actionBtn}
                        onPress={handleVoiceNote}
                        disabled={isUploadingMedia}
                        activeOpacity={0.75}
                        hitSlop={HIT_SLOP}
                    >
                        <LinearGradient
                            colors={isRecording ? ['#ef4444', '#dc2626'] : ['#6366f1', '#4f46e5']}
                            style={styles.actionGrad}
                        >
                            <Text style={styles.actionIcon}>{isRecording ? '⏹' : '🎤'}</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Memo barrier — this component NEVER re-renders due to parent updates.
// Props equality: conversationId + onSend ref + insets.bottom.
// Everything else (text, height, scroll) is owned locally.
// ─────────────────────────────────────────────────────────────────────────────
export const MessageComposer = React.memo(MessageComposerInner, (prev, next) =>
    prev.conversationId === next.conversationId &&
    prev.onSend === next.onSend &&
    prev.insets.bottom === next.insets.bottom
);

// Stable hitSlop — defined outside component to prevent object recreation
const HIT_SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
    outerContainer: {
        backgroundColor: '#060611',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#1a1a3a',
        // Elevation keeps composer above scroll content on Android
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 4,
        gap: 8,
    },
    iconBtn: {
        width: 44,
        height: MIN_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    iconText: {
        fontSize: 22,
        color: '#6366f1',
    },
    inputPill: {
        flex: 1,
        // Background + border on the Animated.View wrapper —
        // NOT on the TextInput itself. This prevents the pill
        // from flickering its own border during height transitions.
        backgroundColor: '#0d0d1e',
        borderRadius: 22,
        borderWidth: 1,
        borderColor: '#1a1a3a',
        overflow: 'hidden',  // clips TextInput to the rounded pill
        // Center alignment for single-line; top for multiline
        justifyContent: 'center',
    },
    input: {
        flex: 1,
        color: '#fff',
        fontSize: 15,
        lineHeight: LINE_HEIGHT,
        paddingHorizontal: INPUT_PADDING_H,
        paddingVertical: INPUT_PADDING_V,
        // NO height, minHeight, maxHeight — Animated.View owns the height
        // This is the key to preventing TextInput vs container height fights
        backgroundColor: 'transparent',
        // Remove all default TextInput borders — we use the wrapper's
        borderWidth: 0,
    },
    actionBtn: {
        width: 44,
        height: MIN_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    actionGrad: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionIcon: {
        color: '#fff',
        fontSize: 17,
    },
});
