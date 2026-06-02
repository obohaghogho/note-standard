import React, { useRef, useCallback, useState } from 'react';
import {
    View, TextInput, TouchableOpacity, Text, StyleSheet, Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MediaService } from '../../services/MediaService';
import VoiceService from '../../services/VoiceService';
import { Alert } from 'react-native';

interface Props {
    conversationId: string;
    onSend: (text: string, attachmentId?: string) => void; // No longer async — fire and forget
    insets: { bottom: number };
}

/**
 * MessageComposer — WhatsApp-speed edition
 *
 * Key optimizations:
 * 1. onSend is synchronous from the composer's perspective — no await,
 *    no `sending` gate. The bubble appears before any API call.
 * 2. `displayText` is the only state — kept minimal to avoid re-renders.
 * 3. TextInput never unmounts, preventing keyboard dismiss/re-open flicker.
 * 4. Keyboard props tuned for instant response: no autoCorrect layout thrash.
 */
const MessageComposerInner = ({ conversationId, onSend, insets }: Props) => {
    const [displayText, setDisplayText] = useState('');
    const [isRecording, setIsRecording] = useState(false);
    const [isUploadingMedia, setIsUploadingMedia] = useState(false);
    const textRef = useRef('');

    const handleChangeText = useCallback((val: string) => {
        textRef.current = val;
        setDisplayText(val);
    }, []);

    const handleSend = useCallback(() => {
        const trimmed = textRef.current.trim();
        if (!trimmed) return;

        // ── Zero latency: clear input FIRST, send AFTER ────────────────────────
        // This mirrors WhatsApp's UX — the input clears instantly and the
        // bubble appears before any network round-trip completes.
        textRef.current = '';
        setDisplayText('');

        // Fire and forget — no await, no blocking
        onSend(trimmed);
    }, [onSend]);

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
            const contentLabel = (asset.mimeType || '').startsWith('video') ? '📹 Video' : '🖼️ Image';
            onSend(contentLabel, attachment.id);
        } catch (err: any) {
            Alert.alert('Upload Error', err.message || 'Failed to upload media.');
        } finally {
            setIsUploadingMedia(false);
        }
    }, [conversationId, onSend, isUploadingMedia]);

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

    const hasText = displayText.trim().length > 0;

    return (
        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.inputRow}>
                <TouchableOpacity
                    style={styles.attachBtn}
                    onPress={handlePickMedia}
                    disabled={isUploadingMedia || isRecording}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                    <Text style={styles.attachIcon}>{isUploadingMedia ? '⏳' : '📎'}</Text>
                </TouchableOpacity>

                {/* TextInput never remounts — keyboard stays open */}
                <TextInput
                    style={styles.input}
                    placeholder="Message..."
                    placeholderTextColor="#444"
                    value={displayText}
                    onChangeText={handleChangeText}
                    multiline
                    maxLength={2000}
                    returnKeyType="default"
                    textAlignVertical="center"
                    blurOnSubmit={false}
                    // Keyboard performance tuning
                    autoCorrect={false}
                    autoCapitalize="sentences"
                    keyboardType="default"
                    // Prevent unnecessary scroll conflicts in single-line mode
                    scrollEnabled={displayText.length > 100}
                    // iOS: keyboard animation feels native-attached
                    keyboardAppearance="dark"
                    // Immediate focus response
                    disableFullscreenUI={true}
                />

                {hasText ? (
                    <TouchableOpacity
                        style={styles.sendBtn}
                        onPress={handleSend}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <LinearGradient
                            colors={['#6366f1', '#4f46e5']}
                            style={styles.sendGrad}
                        >
                            <Text style={styles.sendIcon}>➤</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                ) : (
                    <TouchableOpacity
                        style={styles.micBtn}
                        onPress={handleVoiceNote}
                        disabled={isUploadingMedia}
                        activeOpacity={0.7}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <LinearGradient
                            colors={isRecording ? ['#ef4444', '#dc2626'] : ['#6366f1', '#4f46e5']}
                            style={styles.sendGrad}
                        >
                            <Text style={styles.sendIcon}>{isRecording ? '⏹' : '🎤'}</Text>
                        </LinearGradient>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
};

// React.memo: composer never re-renders when parent re-renders (messages update)
export const MessageComposer = React.memo(MessageComposerInner, (prev, next) => {
    // Only re-render if these structural props change
    return (
        prev.conversationId === next.conversationId &&
        prev.onSend === next.onSend &&
        prev.insets.bottom === next.insets.bottom
    );
});

const styles = StyleSheet.create({
    inputContainer: {
        backgroundColor: '#0d0d1e',
        borderTopWidth: 1,
        borderColor: '#111133',
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'flex-end',
        paddingHorizontal: 12,
        paddingTop: 10,
        borderTopWidth: 1,
        borderColor: '#111133',
        backgroundColor: '#060611',
        gap: 8,
    },
    attachBtn: {
        width: 44,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
    },
    attachIcon: { fontSize: 24, color: '#6366f1' },
    input: {
        flex: 1,
        backgroundColor: '#0d0d1e',
        borderRadius: 24,
        paddingHorizontal: 16,
        paddingVertical: Platform.OS === 'ios' ? 12 : 10,
        color: '#fff',
        fontSize: 15,
        borderWidth: 1,
        borderColor: '#111133',
        maxHeight: 120,
        minHeight: 48,
    },
    micBtn: { borderRadius: 24, overflow: 'hidden' },
    sendBtn: { borderRadius: 24, overflow: 'hidden' },
    sendGrad: {
        width: 48,
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 24,
    },
    sendIcon: { color: '#fff', fontSize: 18 },
});
