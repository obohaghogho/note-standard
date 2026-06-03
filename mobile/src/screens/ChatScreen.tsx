import React, { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import {
    View, Text, TouchableOpacity,
    StyleSheet, Platform, Image,
    Alert, Share, InteractionManager,
} from 'react-native';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';

import { FlashList } from '@shopify/flash-list';
const SafeFlashList = FlashList as any;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useMessages, useConversations } from '../context/ChatContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useIsFocused } from '@react-navigation/native';
import { ChatStackParamList } from '../navigation/ChatStack';
import { Audio } from 'expo-av';
import SignalingService from '../services/SignalingService';
import apiClient from '../api/apiClient';

import { MessageComposer } from '../components/chat/MessageComposer';
import { ChatMessageBubble, Message } from '../components/chat/ChatMessageBubble';
import { MessageActionSheet } from '../components/chat/MessageActionSheet';

type Props = {
    navigation: NativeStackNavigationProp<ChatStackParamList, 'Chat'>;
    route: RouteProp<ChatStackParamList, 'Chat'>;
};

export default function ChatScreen({ navigation, route }: Props) {
    const { conversationId, conversation } = route.params || {};
    const { user } = useAuth();

    // Scoped selectors — each only subscribes to what it needs
    const { sendMessage, editMessage, deleteMessage, onMessageVisible, messages } = useMessages();
    const { setActiveConversationId } = useConversations();

    const isFocused = useIsFocused();
    const insets = useSafeAreaInsets();

    const [audioPlayer, setAudioPlayer] = useState<Audio.Sound | null>(null);
    const [replyTo, setReplyTo] = useState<Message | null>(null);
    const [editingMessage, setEditingMessage] = useState<Message | null>(null);
    const [actionSheetMessage, setActionSheetMessage] = useState<Message | null>(null);

    // Stable refs — read in callbacks without stale closures
    const editingMessageRef = useRef<Message | null>(null);
    editingMessageRef.current = editingMessage;
    const replyToRef = useRef<Message | null>(null);
    replyToRef.current = replyTo;

    const flatRef = useRef<any>(null);

    // Derive messages for this conversation — memoized stable array
    const conversationMessages = useMemo(
        () => messages[conversationId] || EMPTY_ARRAY,
        [messages, conversationId]
    );

    const members = conversation?.members ?? [];
    const otherMember = members.find((m: any) => m.user_id !== user?.id);
    const profile = otherMember?.profile;
    const isOtherOnline = profile?.is_online || false;
    const recipientName = profile?.full_name?.trim() || profile?.username?.trim() || 'Chat';

    useEffect(() => {
        if (isFocused) {
            // CRITICAL: defer setActiveConversationId until AFTER the
            // keyboard animation and screen transition completes.
            // Without this, the context update fires during the transition,
            // causing a re-render storm while the screen is animating in.
            const task = InteractionManager.runAfterInteractions(() => {
                setActiveConversationId(conversationId);
            });
            return () => task.cancel();
        } else {
            setActiveConversationId(null);
        }
    }, [isFocused, conversationId, setActiveConversationId]);

    // handleSend is synchronous — matches the new fire-and-forget MessageComposer API
    const handleSend = useCallback((content: string, attachmentId?: string) => {
        const editMsg = editingMessageRef.current;
        const repTo = replyToRef.current;
        if (editMsg) {
            editMessage(conversationId, editMsg.id, content);
            setEditingMessage(null);
        } else {
            // Fire and forget — no await
            sendMessage(conversationId, content, attachmentId, repTo?.id);
            setReplyTo(null);
        }
    }, [conversationId, editMessage, sendMessage]);

    const handleDeleteMsg = useCallback((msg: Message) => {
        Alert.alert('Delete Message', 'This message will be permanently deleted.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: () => deleteMessage(conversationId, msg.id) },
        ]);
    }, [conversationId, deleteMessage]);

    const playVoiceNote = useCallback(async (path: string) => {
        try {
            if (audioPlayer) await audioPlayer.unloadAsync();
            const res = await apiClient.get(`/media/signed-url?path=${path}`);
            const { sound } = await Audio.Sound.createAsync({ uri: res.data.url });
            setAudioPlayer(sound);
            await sound.playAsync();
        } catch (err) {
            console.warn('Failed to play audio', err);
        }
    }, [audioPlayer]);    // playVoiceNote depends on audioPlayer state — wrap in ref so
    // renderMessage does NOT need it as a dependency (avoids all-rows re-render
    // every time audioPlayer changes).
    const playVoiceNoteRef = useRef(playVoiceNote);
    playVoiceNoteRef.current = playVoiceNote;
    const stablePlayVoiceNote = useCallback((path: string) => {
        playVoiceNoteRef.current(path);
    }, []); // ← Empty deps: permanently stable


    const handleCopy = useCallback((msg: Message) => {
        try { Share.share({ message: msg.content }).catch(() => {}); } catch (_) {}
    }, []);

    const handleShare = useCallback(async (msg: Message) => {
        try { await Share.share({ message: msg.content }); } catch (_) {}
    }, []);

    // recipientName ref — profile loads asynchronously after mount.
    // By reading via ref inside renderMessage, we avoid making
    // recipientName a dep that would invalidate all 200 bubbles on load.
    const recipientNameRef = useRef(recipientName);
    recipientNameRef.current = recipientName;

    // ── renderMessage — PERMANENTLY STABLE (empty deps) ───────────────────────
    // • recipientName → via ref (profile load doesn't trigger rerender)
    // • playVoiceNote → via stablePlayVoiceNote proxy (audioPlayer changes safe)
    // • setActionSheetMessage / setReplyTo → stable setState refs from useState
    // Result: receiving 100 messages = 0 unnecessary bubble re-renders
    const renderMessage = useCallback(({ item }: { item: Message }) => (
        <ChatMessageBubble
            item={item}
            currentUserId={user?.id ?? ''}
            recipientName={recipientNameRef.current}
            onLongPress={setActionSheetMessage}
            onSwipeRight={setReplyTo}
            onPlayAudio={stablePlayVoiceNote}
        />
    ), [user?.id, stablePlayVoiceNote]); // recipientName via ref — not a dep

    // ── Viewability-based read receipts — OFF the render path ─────────────────
    // Fires only when items enter/leave the viewport, not on every render.
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 80 }).current;
    const onViewableItemsChanged = useCallback(({ viewableItems }: any) => {
        viewableItems.forEach(({ item }: { item: Message }) => {
            if (!item.isOwn && item.status !== 'read' && !item.read_at) {
                onMessageVisible(conversationId, item.id);
            }
        });
    }, [conversationId, onMessageVisible]);

    const startCall = useCallback(async (callType: 'audio' | 'video') => {
        if (!otherMember?.user_id) return;
        try {
            await SignalingService.startCall(otherMember.user_id, recipientName, callType, conversationId);
            navigation.navigate('Call', {
                type: callType,
                conversationId,
                targetUserId: otherMember.user_id,
                targetName: recipientName,
                isIncoming: false,
            });
        } catch (err) {
            Alert.alert('Call Failed', 'Could not start call. Please check your connection.');
        }
    }, [otherMember?.user_id, recipientName, conversationId, navigation]);

    const keyExtractor = useCallback((item: Message) =>
        // Prefer event_id for stability across optimistic→canonical transitions
        item.event_id ?? item.id ?? item.created_at
    , []);

    if (!conversationId) {
        return <View style={styles.center}><Text style={{ color: '#fff' }}>No conversation selected.</Text></View>;
    }

    // ── NATIVE 60FPS KEYBOARD TRACKING ──────────────────────────────────────────
    // Instead of relying on React Native's KAV which waits for the JS bridge and
    // causes delayed "jumps" on Android, we use Reanimated to track the keyboard
    // frame natively at 60 FPS. This exactly mimics WhatsApp's input tracking.
    const keyboard = useAnimatedKeyboard();
    const animatedKeyboardStyle = useAnimatedStyle(() => {
        // The keyboard height includes the system's bottom safe area (e.g. iPhone home indicator).
        // Since MessageComposer already applies `paddingBottom: insets.bottom`, we must
        // subtract it here so the composer doesn't float above the keyboard.
        const kbHeight = keyboard.height.value;
        // Ensure we never return a negative padding if the keyboard is closed.
        const offset = kbHeight > insets.bottom ? kbHeight - insets.bottom : 0;

        return {
            paddingBottom: offset,
        };
    });

    return (
        <Animated.View style={[styles.container, animatedKeyboardStyle]}>
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
                {profile?.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.headerAvatar as any} />
                ) : (
                    <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.headerAvatar}>
                        <Text style={styles.headerAvatarText}>{recipientName.charAt(0).toUpperCase()}</Text>
                    </LinearGradient>
                )}
                <View style={styles.headerInfo}>
                    <Text style={styles.headerName}>{recipientName}</Text>
                    <Text style={[styles.headerStatus, { color: isOtherOnline ? '#10b981' : '#666' }]}>
                        ● {isOtherOnline ? 'Online' : 'Offline'}
                    </Text>
                </View>
                <View style={styles.headerActions}>
                    <TouchableOpacity onPress={() => startCall('audio')} style={styles.headerActionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.headerActionIcon}>📞</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => startCall('video')} style={styles.headerActionBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={styles.headerActionIcon}>📹</Text>
                    </TouchableOpacity>
                </View>
            </View>

            {/* Message list — fully isolated from composer height changes.
                The flex:1 + overflow:hidden shell means when the composer
                grows, the list SHRINKS from the bottom (not the top).
                This prevents the scroll position from jumping. */}
            <View style={styles.listShell}>
                <SafeFlashList
                    ref={flatRef}
                    data={conversationMessages}
                    keyExtractor={keyExtractor}
                    renderItem={renderMessage}
                    inverted
                    // Interactive dismiss: swipe down on list dismisses keyboard (WhatsApp)
                    keyboardDismissMode="interactive"
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                    // ── FlashList performance tuning ────────────────────────────
                    estimatedItemSize={80}
                    // drawDistance: pre-render 2 screens above/below viewport
                    drawDistance={800}
                    removeClippedSubviews={true}
                    // windowSize: 5 = render 2 screens above + 2 below the viewport.
                    // Higher = more memory. 5 is the WhatsApp sweet spot.
                    // (FlatList default is 21 — way too high)
                    windowSize={5}
                    // Batch larger chunks less often = fewer interruptions to JS thread
                    maxToRenderPerBatch={10}
                    // 50ms batching: groups rapid scroll events into fewer renders
                    updateCellsBatchingPeriod={50}
                    // maintainVisibleContentPosition: scroll stays put when composer grows
                    maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                    // ── Read receipts — off render path ────────────────────────────
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
                    contentContainerStyle={styles.msgList}
                    ListEmptyComponent={
                        <View style={styles.emptyChat}>
                            <Text style={styles.emptyChatText}>No messages yet. Say hello! 👋</Text>
                        </View>
                    }
                />
            </View>

            {actionSheetMessage && (
                <MessageActionSheet
                    message={actionSheetMessage}
                    currentUserId={user?.id ?? ''}
                    onClose={() => setActionSheetMessage(null)}
                    onReply={setReplyTo}
                    onCopy={handleCopy}
                    onShare={handleShare}
                    onEdit={setEditingMessage}
                    onDelete={handleDeleteMsg}
                />
            )}

            {editingMessage && (
                <View style={styles.actionPreview}>
                    <View style={styles.actionInfo}>
                        <Text style={styles.actionTitle}>Editing Message</Text>
                        <Text style={styles.actionText} numberOfLines={1}>{editingMessage.content}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setEditingMessage(null)} style={styles.actionClose}>
                        <Text style={styles.actionCloseText}>✕</Text>
                    </TouchableOpacity>
                </View>
            )}

            {replyTo && (
                <View style={styles.actionPreview}>
                    <View style={styles.actionInfo}>
                        <Text style={styles.actionTitle}>↩ Replying to {replyTo.sender_id === user?.id ? 'yourself' : recipientName}</Text>
                        <Text style={styles.actionText} numberOfLines={1}>{replyTo.content}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.actionClose}>
                        <Text style={styles.actionCloseText}>✕</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* MessageComposer never remounts — keyboard stays open */}
            <MessageComposer
                conversationId={conversationId}
                onSend={handleSend}
                insets={insets}
            />
        </Animated.View>
    );
}

// Stable empty array — prevents unnecessary re-renders from `|| []`
const EMPTY_ARRAY: Message[] = [];

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#060611' },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    // listShell: isolated flex container that owns all vertical space between
    // header and composer. When composer grows, this shrinks — the list
    // does NOT re-measure or re-render its items.
    listShell: { flex: 1, overflow: 'hidden' },
    header: {
        flexDirection: 'row', alignItems: 'center',
        paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16,
        borderBottomWidth: 1, borderColor: '#111133', backgroundColor: '#060611',
        // zIndex keeps header above the list during fast scrolls
        zIndex: 10,
    },
    backBtn: { marginRight: 12, padding: 4 },
    backText: { color: '#6366f1', fontSize: 32, lineHeight: 32 },
    headerAvatar: {
        width: 42, height: 42, borderRadius: 21,
        justifyContent: 'center', alignItems: 'center', marginRight: 12,
    },
    headerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    headerInfo: { flex: 1 },
    headerName: { color: '#fff', fontSize: 17, fontWeight: '700' },
    headerStatus: { color: '#10b981', fontSize: 12, marginTop: 2 },
    headerActions: { flexDirection: 'row', gap: 12 },
    headerActionBtn: {
        width: 36, height: 36, borderRadius: 18,
        backgroundColor: '#111133', justifyContent: 'center', alignItems: 'center',
    },
    headerActionIcon: { fontSize: 18 },
    msgList: { padding: 16, paddingBottom: 8 },
    emptyChat: { alignItems: 'center', paddingTop: 60 },
    emptyChatText: { color: '#444', fontSize: 14 },
    actionPreview: {
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#0d0d1e', padding: 12,
        borderTopWidth: 1, borderColor: '#111133',
    },
    actionInfo: { flex: 1 },
    actionTitle: { color: '#6366f1', fontSize: 12, fontWeight: '700', marginBottom: 2 },
    actionText: { color: '#aaa', fontSize: 12 },
    actionClose: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
    actionCloseText: { color: '#666', fontSize: 18 },
});
