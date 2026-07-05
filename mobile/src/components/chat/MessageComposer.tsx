/**
 * MessageComposer — WhatsApp-identical input behavior
 *
 * ROOT CAUSE of all previous failures:
 * The Animated.Value + onContentSizeChange + phase-switching approach
 * introduced a race condition: content height changed faster than the
 * animation could track it, causing text to be CLIPPED in Phase 1.
 *
 * THE CORRECT SOLUTION (what WhatsApp actually does):
 * ─────────────────────────────────────────────────────────────────────
 * React Native's TextInput with multiline={true} ALREADY handles
 * grow-then-scroll natively when you set maxHeight on the container.
 *
 *   minHeight: single-line pill height (44px)
 *   maxHeight: 5-line cap (~130px)
 *   scrollEnabled: true (always — platform handles this)
 *
 * The TextInput grows from minHeight → maxHeight naturally.
 * After maxHeight is reached, content scrolls INSIDE the TextInput.
 * No Animated.Value. No onContentSizeChange. No phase switching.
 * The platform does it. We just constrain the box.
 *
 * ISOLATION:
 * ─────────────────────────────────────────────────────────────────────
 * • textRef holds canonical draft — React state NEVER touches global context
 * • displayText is local state only — no parent re-renders on keystroke
 * • React.memo with surgical comparator — parent re-renders never reach here
 * • onSend is fire-and-forget — no await, no disabled gate
 * • TextInput NEVER unmounts — keyboard stays permanently attached
 */

import React, { useRef, useCallback, useState } from 'react';
import {
    View, TextInput, TouchableOpacity, Text,
    StyleSheet, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MediaService } from '../../services/MediaService';
import VoiceService from '../../services/VoiceService';
import { Alert } from 'react-native';

// ── Layout constants ──────────────────────────────────────────────────────────
// LINE_HEIGHT must match TextInput fontSize × 1.4 to avoid mis-measurement.
const LINE_HEIGHT = 22;
const MIN_INPUT_HEIGHT = 44;
// 5 lines + top/bottom padding = WhatsApp's exact cap
const MAX_INPUT_HEIGHT = LINE_HEIGHT * 5 + 22;
const PADDING_V = Platform.OS === 'ios' ? 11 : 9;
const PADDING_H = 16;

interface Props {
    conversationId: string;
    onSend: (text: string, attachmentId?: string) => void;
    insets: { bottom: number };
}

// ─────────────────────────────────────────────────────────────────────────────
// The ONLY component that owns draft text state.
// Nothing above it ever re-renders due to typing.
// ─────────────────────────────────────────────────────────────────────────────
const MessageComposerInner = ({ conversationId, onSend, insets }: Props) => {
    // displayText: only state atom — drives the controlled input.
    // Everything else (send, upload state) is isolated below.
    const [displayText, setDisplayText] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [isUploading, setIsUploading] = useState(false);

    // textRef: synchronous canonical value.
    // handleSend reads this — never waits for a React cycle.
    const textRef = useRef('');

    // handleChangeText: the ONLY function called on every keystroke.
    // Runs in ~0.1ms. No context writes. No parent notifications.
    const handleChangeText = useCallback((val: string) => {
        textRef.current = val;
        setDisplayText(val);
    }, []);

    const handleSend = useCallback(() => {
        const text = textRef.current.trim();
        if (!text) return;

        // ── WhatsApp send sequence ──────────────────────────────────────────
        // 1. Clear ref synchronously (so rapid double-tap sends nothing twice)
        // 2. Clear visual state (user sees empty input instantly)
        // 3. Fire network — happens AFTER visual update, never blocks it
        textRef.current = '';
        setDisplayText('');
        onSend(text); // fire and forget
    }, [onSend]);

    const handlePickMedia = useCallback(async () => {
        if (isUploading) return;
        try {
            const asset = await MediaService.pickImage();
            if (!asset) return;
            setIsUploading(true);
            const att = await MediaService.uploadMedia(
                asset.uri,
                asset.fileName || `upload_${Date.now()}.jpg`,
                asset.mimeType || 'image/jpeg',
                conversationId
            );
            onSend((asset.mimeType || '').startsWith('video') ? '📹 Video' : '🖼️ Image', att.id);
        } catch (err: any) {
            Alert.alert('Upload Error', err.message || 'Upload failed.');
        } finally {
            setIsUploading(false);
        }
    }, [conversationId, onSend, isUploading]);

    const handleVoice = useCallback(async () => {
        if (isRecording) {
            setIsRecording(false);
            setIsUploading(true);
            try {
                const att = await VoiceService.stopRecording(conversationId);
                if (att) onSend('🎤 Voice Note', att.id);
                else Alert.alert('Voice Note', 'Recording was empty.');
            } catch (err: any) {
                Alert.alert('Recording Error', err.message);
            } finally {
                setIsUploading(false);
            }
        } else {
            try {
                await VoiceService.startRecording();
                setIsRecording(true);
            } catch (err: any) {
                Alert.alert('Recording Error', err.message);
            }
        }
    }, [conversationId, onSend, isRecording]);

    const hasText = displayText.length > 0;

    return (
        <View style={[styles.outerWrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
            <View style={styles.row}>

                {/* Attach ─────────────────────────────────────────────────── */}
                <TouchableOpacity
                    style={styles.sideBtn}
                    onPress={handlePickMedia}
                    disabled={isUploading || isRecording}
                    hitSlop={SLOP}
                    activeOpacity={0.7}
                >
                    <Text style={styles.sideBtnIcon}>{isUploading ? '⏳' : '📎'}</Text>
                </TouchableOpacity>

                {/* ── Input pill ──────────────────────────────────────────────
                    The pill View constrains max height.
                    The TextInput fills it and scrolls internally once full.
                    NO Animated.Value. NO onContentSizeChange. NO phase logic.
                    This is exactly how WhatsApp works. */}
                <View style={styles.pill}>
                    <TextInput
                        style={styles.input}
                        value={displayText}
                        onChangeText={handleChangeText}
                        placeholder="Message..."
                        placeholderTextColor="#555"

                        // ── Multiline + internal scroll ───────────────────────
                        multiline={true}
                        // scrollEnabled=true: once content > maxHeight of the
                        // pill container, the user scrolls INSIDE the TextInput.
                        // This is the exact WhatsApp scroll behavior.
                        scrollEnabled={true}

                        // ── Keyboard tuning ───────────────────────────────────
                        // blurOnSubmit=false: return key inserts newline, never
                        // dismisses keyboard (WhatsApp behavior).
                        blurOnSubmit={false}
                        returnKeyType="default"
                        // autoCorrect=false: prevents layout recalculation on
                        // every suggestion change (typing performance critical)
                        autoCorrect={false}
                        autoCapitalize="sentences"
                        keyboardType="default"
                        keyboardAppearance="dark"
                        // disableFullscreenUI: prevents Android from replacing
                        // the inline input with a fullscreen editor popup
                        disableFullscreenUI={true}
                        // textAlignVertical=top: in multiline, keeps cursor at
                        // top of content — prevents cursor from centering then
                        // jumping when text fills the box
                        textAlignVertical="top"

                        maxLength={4000}
                    />
                </View>

                {/* Send / Mic ─────────────────────────────────────────────── */}
                {hasText ? (
                    <TouchableOpacity
                        style={styles.sideBtn}
                        onPress={handleSend}
                        hitSlop={SLOP}
                        activeOpacity={0.75}
                    >
                        <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.actionGrad}>
                            <Text style={styles.actionIcon}>➤</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={styles.sideBtn}
                        onPress={handleVoice}
                        disabled={isUploading}
                        hitSlop={SLOP}
                        activeOpacity={0.75}
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
// Memo barrier — composer NEVER re-renders from parent updates.
// Only structural prop changes (conversationId swap, insets) trigger a re-render.
// ─────────────────────────────────────────────────────────────────────────────
export const MessageComposer = React.memo(MessageComposerInner, (prev, next) =>
    prev.conversationId === next.conversationId &&
    prev.onSend === next.onSend &&
    prev.insets.bottom === next.insets.bottom
);

// Stable hitSlop object — defined outside component, zero GC pressure
const SLOP = { top: 10, bottom: 10, left: 10, right: 10 };

const styles = StyleSheet.create({
    outerWrap: {
        backgroundColor: '#060611',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: '#1a1a3a',
        // Android: elevation keeps composer visually above the scroll list
        elevation: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'flex-end',  // side buttons anchor to bottom as pill grows
        paddingHorizontal: 10,
        paddingTop: 8,
        paddingBottom: 4,
        gap: 8,
    },
    sideBtn: {
        width: 44,
        height: MIN_INPUT_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        flexShrink: 0,
    },
    sideBtnIcon: {
        fontSize: 20,
    },
    // ── The pill container ───────────────────────────────────────────────────
    // minHeight: expands from single-line height
    // maxHeight: caps growth at 5 lines (WhatsApp's exact cap)
    // Once TextInput content exceeds maxHeight, it scrolls INSIDE the pill.
    // The pill itself does NOT grow beyond maxHeight — layout is frozen.
    pill: {
        flex: 1,
        minHeight: MIN_INPUT_HEIGHT,
        maxHeight: MAX_INPUT_HEIGHT,
        backgroundColor: '#0d0d1e',
        borderRadius: 22,
        borderWidth: 1,
        borderColor: '#1a1a3a',
        overflow: 'hidden',
        justifyContent: 'center',
    },
    // ── TextInput fills the pill entirely ───────────────────────────────────
    // NO minHeight/maxHeight on the input itself — the pill owns those.
    // This prevents the TextInput from fighting its container's constraints.
    // flex:1 makes the input fill whatever space the pill has allocated.
    input: {
        flex: 1,
        color: '#fff',
        fontSize: 15,
        lineHeight: LINE_HEIGHT,
        paddingHorizontal: PADDING_H,
        paddingTop: PADDING_V,
        paddingBottom: PADDING_V,
        // NO height, minHeight, maxHeight — pill owns all sizing
        backgroundColor: 'transparent',
        borderWidth: 0,
    },
    actionGrad: {
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
    },
    actionIcon: { color: '#fff', fontSize: 18 },
});
