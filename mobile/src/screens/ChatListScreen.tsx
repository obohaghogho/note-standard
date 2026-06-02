import React, { useEffect, useCallback, memo } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet,
    RefreshControl, Image,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
const SafeFlashList = FlashList as any;
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useConversations } from '../context/ChatContext';
import { ChatService, Conversation } from '../services/ChatService';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatStackParamList } from '../navigation/ChatStack';
import { useIsFocused } from '@react-navigation/native';
import { FriendsList } from '../components/FriendsList';
import apiClient from '../api/apiClient';
import { Alert } from 'react-native';

type Props = { navigation: NativeStackNavigationProp<ChatStackParamList, 'ChatList'> };

// ─────────────────────────────────────────────────────────────────────────────
// ConversationItem — MEMOIZED with surgical areEqual comparator.
// Only re-renders when its own data changes — not when other conversations do.
// ─────────────────────────────────────────────────────────────────────────────
interface ConversationItemProps {
    item: Conversation;
    userId: string;
    onPress: () => void;
    onAccept?: () => void;
}

const ConversationItem = memo(({
    item, userId, onPress, onAccept
}: ConversationItemProps) => {
    const otherMember = item.members?.find(m => m.user_id !== userId);
    const myMember = item.members?.find(m => m.user_id === userId);
    const profile = otherMember?.profile;
    const name = profile?.full_name?.trim()
        || profile?.username?.trim()
        || (otherMember?.user_id ? `User ${otherMember.user_id.substring(0, 6)}` : 'Unknown');
    const isPending = myMember?.status === 'pending';
    const otherPending = otherMember?.status === 'pending';
    const initial = name.charAt(0).toUpperCase();

    // Last message preview — derived without creating new objects
    const lastMsg = (item as any).last_message ?? (item as any).lastMessage;
    let subText = 'Tap to open chat';
    let isMe = false;
    let tickStr = '';
    let tickColor = 'rgba(255,255,255,0.3)';

    if (isPending) {
        subText = '📩 Wants to connect with you';
    } else if (otherPending) {
        subText = '⏳ Waiting for their acceptance';
    } else if (lastMsg) {
        isMe = lastMsg.sender_id === userId;
        let content = lastMsg.content || 'Attachment';
        content = content.length > 40 ? content.slice(0, 40) + '…' : content;
        subText = (isMe ? 'You: ' : '') + content;
        if (isMe) {
            if (lastMsg.read_at) { tickStr = '  ✓✓'; tickColor = '#60a5fa'; }
            else if (lastMsg.delivered_at) { tickStr = '  ✓✓'; tickColor = 'rgba(255,255,255,0.5)'; }
            else { tickStr = '  ✓'; tickColor = 'rgba(255,255,255,0.3)'; }
        }
    }

    const unreadCount = (item as any).unreadCount || 0;
    const timeStr = lastMsg?.created_at
        ? new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : '';

    return (
        <TouchableOpacity
            style={[styles.item, isPending && styles.itemPending]}
            onPress={onPress}
            activeOpacity={0.75}
        >
            <View style={styles.avatarWrap}>
                {profile?.avatar_url ? (
                    <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
                ) : (
                    <LinearGradient
                        colors={isPending ? ['#3b82f6', '#1d4ed8'] : ['#6366f1', '#4f46e5']}
                        style={styles.avatarGrad}
                    >
                        <Text style={styles.avatarInitial}>{initial}</Text>
                    </LinearGradient>
                )}
                <View style={[
                    styles.onlineDot,
                    { backgroundColor: isPending ? '#3b82f6' : (profile?.is_online ? '#10b981' : '#444') }
                ]} />
            </View>

            <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>{name}</Text>
                <Text style={styles.itemSub} numberOfLines={1}>
                    {subText}
                    {isMe && <Text style={{ color: tickColor, fontSize: 10 }}>{tickStr}</Text>}
                </Text>
            </View>

            {isPending && onAccept ? (
                <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
                    <Text style={styles.acceptBtnText}>Accept</Text>
                </TouchableOpacity>
            ) : (
                <View style={styles.rightMeta}>
                    {timeStr !== '' && !isPending && (
                        <Text style={styles.timeLabel}>{timeStr}</Text>
                    )}
                    {unreadCount > 0 && !isPending ? (
                        <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>
                                {unreadCount > 99 ? '99+' : unreadCount}
                            </Text>
                        </View>
                    ) : (
                        <Text style={styles.chevron}>›</Text>
                    )}
                </View>
            )}
        </TouchableOpacity>
    );
}, (prev, next) => {
    // Surgical equality — only re-render if data that affects this row changed
    const prevLast = (prev.item as any).last_message ?? (prev.item as any).lastMessage;
    const nextLast = (next.item as any).last_message ?? (next.item as any).lastMessage;
    return (
        prev.item.id === next.item.id &&
        prev.userId === next.userId &&
        prevLast?.id === nextLast?.id &&
        prevLast?.content === nextLast?.content &&
        prevLast?.read_at === nextLast?.read_at &&
        prevLast?.delivered_at === nextLast?.delivered_at &&
        (prev.item as any).unreadCount === (next.item as any).unreadCount &&
        prev.item.members?.length === next.item.members?.length
    );
});

// ─────────────────────────────────────────────────────────────────────────────
// ChatListScreen — subscribes ONLY to ConversationsContext
// Never re-renders due to message updates in other screens
// ─────────────────────────────────────────────────────────────────────────────
export default function ChatListScreen({ navigation }: Props) {
    const { user } = useAuth();
    // ✅ Scoped selector — only conversations, not messages
    const { conversations, loadConversations } = useConversations();
    const [refreshing, setRefreshing] = React.useState(false);
    const isFocused = useIsFocused();

    const load = useCallback(async () => {
        try {
            await loadConversations();
        } catch (e) {
            console.warn('[ChatList] Load failed:', e);
        }
    }, [loadConversations]);

    useEffect(() => {
        if (isFocused) load();
    }, [isFocused, load]);

    const onRefresh = useCallback(async () => {
        setRefreshing(true);
        await load();
        setRefreshing(false);
    }, [load]);

    const handleAccept = useCallback(async (conversationId: string) => {
        const ok = await ChatService.acceptConversation(conversationId);
        if (ok) load();
    }, [load]);

    const handleSupport = useCallback(async () => {
        try {
            const res = await apiClient.post('/chat/support', { subject: 'Support Request' });
            if (res.data?.conversation) {
                navigation.navigate('Chat', { conversationId: res.data.conversation.id, conversation: res.data.conversation });
            } else if (res.data?.existingChatId) {
                try {
                    const convRes = await apiClient.get(`/chat/conversations/${res.data.existingChatId}`);
                    navigation.navigate('Chat', { conversationId: res.data.existingChatId, conversation: convRes.data });
                } catch {
                    navigation.navigate('Chat', {
                        conversationId: res.data.existingChatId,
                        conversation: { id: res.data.existingChatId, name: 'Support', type: 'direct', members: [] } as any,
                    });
                }
            }
        } catch {
            Alert.alert('Error', 'Failed to connect to Support. Please check your connection.');
        }
    }, [navigation]);

    const pendingCount = React.useMemo(() =>
        conversations.filter(c => {
            const my = c.members?.find((m: any) => m.user_id === user?.id);
            return my?.status === 'pending';
        }).length,
        [conversations, user?.id]
    );

    // ── Stable renderItem — no inline arrow function ───────────────────────────
    const renderItem = useCallback(({ item }: { item: Conversation }) => (
        <ConversationItem
            item={item}
            userId={user?.id || ''}
            onPress={() => {
                // requestAnimationFrame defers navigation until after current frame
                // prevents the list from freezing during the navigation gesture
                requestAnimationFrame(() => {
                    navigation.navigate('Chat', { conversationId: item.id, conversation: item });
                });
            }}
            onAccept={() => handleAccept(item.id)}
        />
    ), [user?.id, navigation, handleAccept]);

    const keyExtractor = useCallback((item: Conversation) => item.id, []);

    const ListHeader = useMemo(() => (
        <View style={styles.socialHeader}>
            <FriendsList
                conversations={conversations}
                currentUserId={user?.id}
            />
            {conversations.length > 0 && (
                <Text style={styles.sectionTitle}>Recent Conversations</Text>
            )}
        </View>
    ), [conversations, user?.id]);

    const ListEmpty = useMemo(() => (
        <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySub}>Tap 🔍 to find and chat with someone</Text>
            <TouchableOpacity
                style={styles.startChatBtn}
                onPress={() => navigation.navigate('FriendSearch')}
            >
                <Text style={styles.startChatBtnText}>Find People</Text>
            </TouchableOpacity>
        </View>
    ), [navigation]);

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View>
                    <Text style={styles.title}>Messages</Text>
                    {pendingCount > 0 && (
                        <Text style={styles.pendingHint}>
                            {pendingCount} pending request{pendingCount !== 1 ? 's' : ''}
                        </Text>
                    )}
                </View>
                <View style={styles.headerRight}>
                    <TouchableOpacity
                        style={styles.searchIconBtn}
                        onPress={() => navigation.navigate('FriendSearch')}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                        <Text style={styles.searchEmoji}>🔍</Text>
                    </TouchableOpacity>
                    {conversations.length > 0 && (
                        <View style={styles.headerBadge}>
                            <Text style={styles.headerBadgeText}>{conversations.length}</Text>
                        </View>
                    )}
                </View>
            </View>

            {/* FlashList — 60fps with surgical memoization */}
            <SafeFlashList
                data={conversations}
                keyExtractor={keyExtractor}
                renderItem={renderItem}
                estimatedItemSize={84}
                drawDistance={400}
                removeClippedSubviews={true}
                ListHeaderComponent={ListHeader}
                ListEmptyComponent={ListEmpty}
                refreshControl={
                    <RefreshControl
                        refreshing={refreshing}
                        onRefresh={onRefresh}
                        tintColor="#6366f1"
                    />
                }
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
            />

            <TouchableOpacity style={styles.fabSupport} onPress={handleSupport}>
                <Text style={styles.fabSupportIcon}>💬</Text>
                <Text style={styles.fabSupportText}>Need Help?</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#060611' },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
        borderBottomWidth: 1, borderColor: '#111133',
    },
    title: { color: '#fff', fontSize: 26, fontWeight: '800' },
    pendingHint: { color: '#3b82f6', fontSize: 12, marginTop: 2, fontWeight: '600' },
    headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    headerBadge: { backgroundColor: '#6366f1', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
    headerBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    searchIconBtn: { padding: 8, backgroundColor: '#111133', borderRadius: 12 },
    searchEmoji: { fontSize: 18 },
    list: { paddingBottom: 100 },
    socialHeader: { marginBottom: 20 },
    sectionTitle: {
        color: '#666', fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
        paddingHorizontal: 20, marginTop: 24, marginBottom: 12,
    },
    item: {
        flexDirection: 'row', alignItems: 'center', padding: 16,
        marginHorizontal: 16, marginBottom: 12, borderRadius: 20,
        backgroundColor: '#0d0d1e', borderWidth: 1, borderColor: '#111133',
    },
    itemPending: { borderColor: '#3b82f644', backgroundColor: '#0a0a20' },
    avatarWrap: { position: 'relative', marginRight: 14 },
    avatar: { width: 52, height: 52, borderRadius: 26 },
    avatarGrad: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
    avatarInitial: { color: '#fff', fontSize: 20, fontWeight: '800' },
    onlineDot: {
        position: 'absolute', bottom: 2, right: 2,
        width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#060611',
    },
    itemInfo: { flex: 1 },
    itemName: { color: '#fff', fontSize: 15, fontWeight: '700' },
    itemSub: { color: '#666', fontSize: 12, marginTop: 3 },
    rightMeta: { alignItems: 'flex-end', gap: 4 },
    timeLabel: { color: '#444', fontSize: 10 },
    unreadBadge: {
        backgroundColor: '#10b981', borderRadius: 10,
        minWidth: 20, height: 20, justifyContent: 'center',
        alignItems: 'center', paddingHorizontal: 5,
    },
    unreadBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    acceptBtn: { backgroundColor: '#3b82f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    acceptBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
    chevron: { color: '#333', fontSize: 24 },
    empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
    emptyIcon: { fontSize: 48, marginBottom: 16 },
    emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
    emptySub: { color: '#666', fontSize: 14, marginTop: 6, textAlign: 'center' },
    startChatBtn: { marginTop: 20, backgroundColor: '#6366f1', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
    startChatBtnText: { color: '#fff', fontWeight: '700' },
    fabSupport: {
        position: 'absolute', bottom: 20, right: 20, backgroundColor: '#3b82f6',
        flexDirection: 'row', alignItems: 'center',
        paddingVertical: 12, paddingHorizontal: 16,
        borderRadius: 30,
        shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3, shadowRadius: 8, elevation: 8,
    },
    fabSupportIcon: { fontSize: 18, marginRight: 6 },
    fabSupportText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
