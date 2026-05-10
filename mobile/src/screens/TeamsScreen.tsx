import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Image, Alert, Modal,
  TextInput, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { TeamsService, Team } from '../services/TeamsService';
import { AuthService } from '../services/AuthService';
import apiClient from '../api/apiClient';

interface TeamMessage {
  id: string;
  content: string;
  created_at: string;
  sender_id: string;
  profiles?: {
    username: string;
    full_name?: string;
    avatar_url?: string;
  };
}

function TeamChatModal({
  team, onClose, currentUserId
}: {
  team: Team; onClose: () => void; currentUserId: string;
}) {
  const [messages, setMessages] = useState<TeamMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const loadMessages = useCallback(async () => {
    try {
      const res = await apiClient.get(`/teams/${team.id}/messages`);
      setMessages(res.data || []);
    } catch (e) {
      console.error('[TeamChat] Failed to load:', e);
    } finally {
      setLoading(false);
    }
  }, [team.id]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  const sendMessage = async () => {
    if (!newMessage.trim()) return;
    setSending(true);
    try {
      await apiClient.post(`/teams/${team.id}/messages`, { content: newMessage.trim() });
      setNewMessage('');
      loadMessages();
    } catch (e) {
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={onClose} style={styles.chatBackBtn}>
            <Text style={styles.chatBackText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.chatHeaderInfo}>
            <Text style={styles.chatHeaderTitle} numberOfLines={1}>{team.name}</Text>
            <Text style={styles.chatHeaderSub}>{team.my_role?.toUpperCase()}</Text>
          </View>
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color="#f59e0b" />
          </View>
        ) : (
          <FlatList
            data={messages}
            keyExtractor={m => m.id}
            contentContainerStyle={styles.messagesList}
            inverted={false}
            renderItem={({ item }) => {
              const isMe = item.sender_id === currentUserId;
              const senderName = item.profiles?.full_name || item.profiles?.username || 'Unknown';
              return (
                <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.theirBubble]}>
                  {!isMe && <Text style={styles.senderName}>{senderName}</Text>}
                  <Text style={styles.messageText}>{item.content}</Text>
                  <Text style={styles.messageTime}>
                    {new Date(item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </Text>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={styles.emptyMsg}>
                <Text style={styles.emptyMsgText}>No messages yet. Start the conversation!</Text>
              </View>
            }
          />
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={styles.messageInput}
            placeholder="Type a message..."
            placeholderTextColor="#555"
            value={newMessage}
            onChangeText={setNewMessage}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !newMessage.trim() && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={sending || !newMessage.trim()}
          >
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendBtnText}>↑</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export default function TeamsScreen() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');

  const load = useCallback(async () => {
    const user = await AuthService.getUser();
    setCurrentUserId(user?.id || '');
    const data = await TeamsService.getMyTeams();
    setTeams(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderTeam = ({ item }: { item: Team }) => (
    <TouchableOpacity
      style={styles.card}
      activeOpacity={0.7}
      onPress={() => setActiveTeam(item)}
    >
      <View style={styles.avatarWrap}>
        {item.avatar_url ? (
          <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
          </View>
        )}
      </View>
      <View style={styles.info}>
        <Text style={styles.name}>{item.name}</Text>
        <Text style={styles.role}>{item.my_role?.toUpperCase()}</Text>
        <Text style={styles.desc} numberOfLines={1}>{item.description || 'Tap to open team chat'}</Text>
      </View>
      <Text style={styles.chatHint}>💬</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#f59e0b" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Teams</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{teams.length}</Text>
        </View>
      </View>

      <FlatList
        data={teams}
        keyExtractor={i => i.id}
        renderItem={renderTeam}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#f59e0b" />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>No teams yet</Text>
            <Text style={styles.emptySub}>Create or join a team from the web platform, then come back here to chat.</Text>
          </View>
        }
      />

      {activeTeam && (
        <TeamChatModal
          team={activeTeam}
          onClose={() => setActiveTeam(null)}
          currentUserId={currentUserId}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060611' },
  header: {
    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20,
    paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#111133',
  },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', flex: 1 },
  countBadge: { backgroundColor: '#f59e0b22', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: '#f59e0b44' },
  countText: { color: '#f59e0b', fontWeight: '700', fontSize: 14 },
  list: { padding: 16 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d1e',
    borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#111133',
  },
  avatarWrap: { marginRight: 16 },
  avatar: { width: 52, height: 52, borderRadius: 16 },
  avatarPlaceholder: {
    width: 52, height: 52, borderRadius: 16, backgroundColor: '#f59e0b22',
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#f59e0b44',
  },
  avatarText: { color: '#f59e0b', fontSize: 20, fontWeight: '800' },
  info: { flex: 1 },
  name: { color: '#fff', fontSize: 16, fontWeight: '700' },
  role: { color: '#f59e0b', fontSize: 10, fontWeight: '800', marginTop: 2 },
  desc: { color: '#666', fontSize: 12, marginTop: 4 },
  chatHint: { fontSize: 20, marginLeft: 8 },
  empty: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySub: { color: '#666', fontSize: 14, marginTop: 6, textAlign: 'center', lineHeight: 22 },
  // Chat Modal
  chatContainer: { flex: 1, backgroundColor: '#060611' },
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 16,
    paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#111133',
  },
  chatBackBtn: { marginRight: 16, padding: 4 },
  chatBackText: { color: '#f59e0b', fontSize: 15, fontWeight: '600' },
  chatHeaderInfo: { flex: 1 },
  chatHeaderTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  chatHeaderSub: { color: '#f59e0b', fontSize: 10, fontWeight: '700', marginTop: 2 },
  messagesList: { padding: 16, paddingBottom: 8 },
  messageBubble: {
    maxWidth: '80%', padding: 12, borderRadius: 18, marginBottom: 10,
  },
  myBubble: { backgroundColor: '#6366f1', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: '#1a1a2e', alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#2a2a4e' },
  senderName: { color: '#f59e0b', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  messageText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  messageTime: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  emptyMsg: { alignItems: 'center', paddingTop: 80 },
  emptyMsgText: { color: '#555', fontSize: 14 },
  inputRow: {
    flexDirection: 'row', alignItems: 'flex-end', padding: 12,
    borderTopWidth: 1, borderColor: '#111133', gap: 10,
  },
  messageInput: {
    flex: 1, backgroundColor: '#0d0d1e', color: '#fff', padding: 14, borderRadius: 20,
    maxHeight: 100, fontSize: 15, borderWidth: 1, borderColor: '#1a1a3e',
  },
  sendBtn: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: '#f59e0b',
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#333' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
