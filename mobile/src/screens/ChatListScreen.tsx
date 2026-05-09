import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { ChatService, Conversation } from '../services/ChatService';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatStackParamList } from '../navigation/ChatStack';

type Props = { navigation: NativeStackNavigationProp<ChatStackParamList, 'ChatList'> };

function ConversationItem({ item, userId, onPress }: { item: Conversation; userId: string; onPress: () => void }) {
  const otherMember = item.members.find(m => m.user_id !== userId);
  const myMember = item.members.find(m => m.user_id === userId);
  const profile = otherMember?.profile;
  const name = profile?.full_name || profile?.username || 'Unknown User';
  const isPending = myMember?.status === 'pending';
  const initial = name.charAt(0).toUpperCase();

  return (
    <TouchableOpacity style={styles.item} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.avatarWrap}>
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.avatar} />
        ) : (
          <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.avatarGrad}>
            <Text style={styles.avatarInitial}>{initial}</Text>
          </LinearGradient>
        )}
        <View style={[styles.onlineDot, { backgroundColor: '#10b981' }]} />
      </View>
      <View style={styles.itemInfo}>
        <Text style={styles.itemName}>{name}</Text>
        <Text style={styles.itemSub} numberOfLines={1}>
          {isPending ? '📩 Wants to chat with you' : 'Tap to open chat'}
        </Text>
      </View>
      {isPending && <View style={styles.badge}><Text style={styles.badgeText}>New</Text></View>}
      <Text style={styles.chevron}>›</Text>
    </TouchableOpacity>
  );
}

export default function ChatListScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const data = await ChatService.getConversations();
    setConversations(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Messages</Text>
        <TouchableOpacity 
          style={styles.searchIconBtn} 
          onPress={() => navigation.navigate('FriendSearch')}
        >
          <Text style={styles.searchEmoji}>🔍</Text>
        </TouchableOpacity>
        <View style={styles.headerBadge}>
          <Text style={styles.headerBadgeText}>{conversations.length}</Text>
        </View>
      </View>

      <FlatList
        data={conversations}
        keyExtractor={i => i.id}
        renderItem={({ item }) => (
          <ConversationItem
            item={item}
            userId={user?.id || ''}
            onPress={() => navigation.navigate('Chat', { conversationId: item.id, conversation: item })}
          />
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>💬</Text>
            <Text style={styles.emptyTitle}>No conversations yet</Text>
            <Text style={styles.emptySub}>Go to Social to connect with friends</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060611' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#111133' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', flex: 1 },
  headerBadge: { backgroundColor: '#6366f1', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  headerBadgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  searchIconBtn: { marginRight: 15, padding: 8, backgroundColor: '#111133', borderRadius: 12 },
  searchEmoji: { fontSize: 18 },
  list: { padding: 16 },
  item: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d1e', borderRadius: 18, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#111133' },
  avatarWrap: { position: 'relative', marginRight: 14 },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarGrad: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: '#fff', fontSize: 20, fontWeight: '800' },
  onlineDot: { position: 'absolute', bottom: 2, right: 2, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: '#060611' },
  itemInfo: { flex: 1 },
  itemName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  itemSub: { color: '#666', fontSize: 12, marginTop: 3 },
  badge: { backgroundColor: '#6366f122', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, marginRight: 8 },
  badgeText: { color: '#6366f1', fontSize: 11, fontWeight: '700' },
  chevron: { color: '#444', fontSize: 24 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySub: { color: '#666', fontSize: 14, marginTop: 6 },
});
