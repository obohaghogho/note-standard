import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { ChatService, Conversation } from '../services/ChatService';
import { AuthService } from '../services/AuthService';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatStackParamList } from '../navigation/ChatStack';
import { io, Socket } from 'socket.io-client';
import { GATEWAY_URL } from '../Config';
import { useIsFocused } from '@react-navigation/native';
import { FriendsList } from '../components/FriendsList';

type Props = { navigation: NativeStackNavigationProp<ChatStackParamList, 'ChatList'> };

function ConversationItem({
  item, userId, onPress, onAccept
}: {
  item: Conversation;
  userId: string;
  onPress: () => void;
  onAccept?: () => void;
}) {
  const otherMember = item.members?.find(m => m.user_id !== userId);
  const myMember = item.members?.find(m => m.user_id === userId);
  const profile = otherMember?.profile;
  const name = profile?.full_name || profile?.username || 'Unknown User';
  const isPending = myMember?.status === 'pending';
  const otherPending = otherMember?.status === 'pending';
  const initial = name.charAt(0).toUpperCase();

  // Format last message preview
  const lastMsg = item.last_message;
  let subText = 'Tap to open chat';
  if (isPending) subText = '📩 Wants to connect with you';
  else if (otherPending) subText = '⏳ Waiting for their acceptance';
  else if (lastMsg?.content) subText = lastMsg.content.length > 40 ? lastMsg.content.slice(0, 40) + '…' : lastMsg.content;

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
          <LinearGradient colors={isPending ? ['#3b82f6', '#1d4ed8'] : ['#6366f1', '#4f46e5']} style={styles.avatarGrad}>
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
        <Text style={styles.itemSub} numberOfLines={1}>{subText}</Text>
      </View>

      {isPending && onAccept ? (
        <TouchableOpacity style={styles.acceptBtn} onPress={onAccept}>
          <Text style={styles.acceptBtnText}>Accept</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.rightMeta}>
          {lastMsg?.created_at && !isPending && (
            <Text style={styles.timeLabel}>
              {new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
          <Text style={styles.chevron}>›</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ChatListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isFocused = useIsFocused();

  const load = useCallback(async () => {
    try {
      // 1. Load from Cache first for instant UI
      const cached = await AsyncStorage.getItem('cache_conversations');
      if (cached && conversations.length === 0) {
        setConversations(JSON.parse(cached));
        setLoading(false);
      }

      const data = await ChatService.getConversations();
      // data is guaranteed to be an array
      const sorted = [...data].sort((a, b) => {
        const myA = a.members?.find(m => m.user_id === user?.id);
        const myB = b.members?.find(m => m.user_id === user?.id);
        const aAccepted = myA?.status === 'accepted' ? 0 : 1;
        const bAccepted = myB?.status === 'accepted' ? 0 : 1;
        return aAccepted - bAccepted;
      });
      
      setConversations(sorted);
      // 2. Persist to Cache
      await AsyncStorage.setItem('cache_conversations', JSON.stringify(sorted));
    } catch (e) {
      console.error('[ChatList] Load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [user?.id, conversations.length]);

  useEffect(() => {
    if (isFocused) load();
  }, [isFocused, load]);

  useEffect(() => {
    // Realtime socket on GATEWAY_URL for list-level events (new conversations)
    let socket: Socket;
    const initSocket = async () => {
      const token = await AuthService.getToken();
      socket = io(GATEWAY_URL, {
        auth: { token },
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
      });
        socket.on('connect', () => console.log('[ChatList] Socket connected'));
        socket.on('chat:new_conversation', () => load());
        socket.on('chat:conversation_updated', () => load());
        
        // Real-time presence updates for the list
        socket.on('user_online', ({ userId, online }) => {
          setConversations(prev => prev.map(conv => {
            const hasUser = conv.members?.some(m => m.user_id === userId);
            if (!hasUser) return conv;
            return {
              ...conv,
              members: conv.members.map(m => 
                m.user_id === userId 
                  ? { ...m, profile: m.profile ? { ...m.profile, is_online: online } : m.profile } 
                  : m
              )
            };
          }));
        });
      };
      initSocket();
      return () => { if (socket) socket.disconnect(); };
    }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const handleAccept = async (conversationId: string) => {
    const ok = await ChatService.acceptConversation(conversationId);
    if (ok) load();
  };

  const pendingCount = conversations.filter(c => {
    const my = c.members?.find(m => m.user_id === user?.id);
    return my?.status === 'pending';
  }).length;

  if (loading && !refreshing) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Messages</Text>
          {pendingCount > 0 && (
            <Text style={styles.pendingHint}>{pendingCount} pending request{pendingCount !== 1 ? 's' : ''}</Text>
          )}
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.searchIconBtn}
            onPress={() => navigation.navigate('FriendSearch')}
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

      <FlatList
        data={conversations}
        keyExtractor={i => i.id}
        ListHeaderComponent={
          <View style={styles.socialHeader}>
            {/* FIX: Pass conversations down — no duplicate API call */}
            <FriendsList
              conversations={conversations}
              currentUserId={user?.id}
            />
            {conversations.length > 0 && (
              <Text style={styles.sectionTitle}>Recent Conversations</Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <ConversationItem
            item={item}
            userId={user?.id || ''}
            onPress={() => navigation.navigate('Chat', { conversationId: item.id, conversation: item })}
            onAccept={() => handleAccept(item.id)}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
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
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060611' },
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
  list: { paddingBottom: 40 },
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
  rightMeta: { alignItems: 'flex-end', gap: 2 },
  timeLabel: { color: '#444', fontSize: 10 },
  acceptBtn: { backgroundColor: '#3b82f6', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  acceptBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  chevron: { color: '#333', fontSize: 24 },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySub: { color: '#666', fontSize: 14, marginTop: 6, textAlign: 'center' },
  startChatBtn: { marginTop: 20, backgroundColor: '#6366f1', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 14 },
  startChatBtnText: { color: '#fff', fontWeight: '700' },
});
