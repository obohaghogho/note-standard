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
import { useIsFocused } from '@react-navigation/native';
import { FriendsList } from '../components/FriendsList';
import apiClient from '../api/apiClient';
import { Alert } from 'react-native';
import { useChat } from '../context/ChatContext';

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
  // Graceful fallback: if the profile JOIN returned null (orphaned member or
  // profile not yet synced), show a shortened user ID instead of "Unknown User"
  const name = profile?.full_name?.trim()
    || profile?.username?.trim()
    || (otherMember?.user_id ? `User ${otherMember.user_id.substring(0, 6)}` : 'Unknown');
  const isPending = myMember?.status === 'pending';
  const otherPending = otherMember?.status === 'pending';
  const initial = name.charAt(0).toUpperCase();

  // Format last message preview
  const lastMsg = item.last_message;
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
          {lastMsg?.created_at && !isPending && (
            <Text style={styles.timeLabel}>
              {new Date(lastMsg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
          )}
          {(item as any).unreadCount > 0 && !isPending && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {(item as any).unreadCount > 99 ? '99+' : (item as any).unreadCount}
              </Text>
            </View>
          )}
          {!(item as any).unreadCount && <Text style={styles.chevron}>›</Text>}
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function ChatListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const { conversations, loadConversations } = useChat();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const isFocused = useIsFocused();

  const load = useCallback(async () => {
    try {
      await loadConversations();
    } catch (e) {
      console.error('[ChatList] Load failed:', e);
    } finally {
      setLoading(false);
    }
  }, [loadConversations]);

  useEffect(() => {
    if (isFocused) {
      load();
    }
  }, [isFocused, load]);



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

  const handleSupport = async () => {
    try {
      const res = await apiClient.post('/chat/support', { subject: 'Support Request' });
      if (res.data?.conversation) {
        navigation.navigate('Chat', { conversationId: res.data.conversation.id, conversation: res.data.conversation });
      } else if (res.data?.existingChatId) {
        // Fetch the full conversation object so ChatScreen has members/profiles
        try {
          const convRes = await apiClient.get(`/chat/conversations/${res.data.existingChatId}`);
          const fullConv = convRes.data;
          navigation.navigate('Chat', { conversationId: res.data.existingChatId, conversation: fullConv });
        } catch {
          // Fallback: navigate without full data — ChatScreen will still load messages
          navigation.navigate('Chat', {
            conversationId: res.data.existingChatId,
            conversation: { id: res.data.existingChatId, name: 'Support', type: 'direct', members: [] } as any,
          });
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to connect to Support. Please check your connection.');
    }
  };

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
            onPress={() => {
               requestAnimationFrame(() => {
                 navigation.navigate('Chat', { conversationId: item.id, conversation: item });
               });
            }}
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

      <TouchableOpacity style={styles.fabSupport} onPress={handleSupport}>
        <Text style={styles.fabSupportIcon}>💬</Text>
        <Text style={styles.fabSupportText}>Need Help?</Text>
      </TouchableOpacity>
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
  rightMeta: { alignItems: 'flex-end', gap: 4 },
  timeLabel: { color: '#444', fontSize: 10 },
  unreadBadge: { backgroundColor: '#10b981', borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 5 },
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
    flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16,
    borderRadius: 30, shadowColor: '#3b82f6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8
  },
  fabSupportIcon: { fontSize: 18, marginRight: 6 },
  fabSupportText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
