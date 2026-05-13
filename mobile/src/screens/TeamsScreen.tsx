import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image,
  Alert, Modal, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TeamsService, Team } from '../services/TeamsService';
import { AuthService } from '../services/AuthService';
import apiClient from '../api/apiClient';
import { MediaService } from '../services/MediaService';
import VoiceService from '../services/VoiceService';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { ChatStackParamList } from '../navigation/ChatStack';
import { io, Socket } from 'socket.io-client';
import { GATEWAY_URL } from '../Config';
import { useLongPressGesture } from '../hooks/useLongPressGesture';

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
  is_edited?: boolean;
  reply_to?: {
    id: string;
    content: string;
    sender_id: string;
  };
}

// ── TeamMessageBubble ─────────────────────────────────────────────────────
const TeamMessageBubble = React.memo(({
  item,
  currentUserId,
  onLongPress,
  playVoiceNote,
}: {
  item: TeamMessage;
  currentUserId: string;
  onLongPress: (msg: TeamMessage) => void;
  playVoiceNote: (path: string) => Promise<void>;
}) => {
  if (!item) return null;
  const isMe = item.sender_id === currentUserId;
  const senderName = item.profiles?.full_name || item.profiles?.username || 'Unknown';
  const attachment = (item as any).attachment;

  const longPressProps = useLongPressGesture({
    onLongPress: () => onLongPress(item),
    delay: 500,
    moveThreshold: 10,
  });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      {...longPressProps}
      style={[styles.messageBubble, isMe ? styles.myBubble : styles.theirBubble]}
    >
      {!isMe && <Text style={styles.senderName}>{senderName}</Text>}

      {item.reply_to && (
        <View style={styles.replyContext}>
          <Text style={styles.replyContextName}>
            {item.reply_to.sender_id === currentUserId ? 'You' : 'Member'}
          </Text>
          <Text style={styles.replyContextText} numberOfLines={1}>
            {item.reply_to.content}
          </Text>
        </View>
      )}

      {attachment && (
        <View style={styles.attachmentContainer}>
          {attachment.file_type?.startsWith('image') ? (
            <Image
              source={{ uri: `https://tngcvgisfctggvivcnva.supabase.co/storage/v1/object/public/chat-media/${attachment.storage_path}` }}
              style={styles.attachmentImage as any}
            />
          ) : attachment.file_type?.startsWith('audio') ? (
            <TouchableOpacity style={styles.voiceNoteBtn} onPress={() => playVoiceNote(attachment.storage_path)}>
              <Text style={styles.voiceNoteText}>▶ Voice Note</Text>
            </TouchableOpacity>
          ) : (
            <Text style={styles.attachmentFile}>📎 {attachment.file_name}</Text>
          )}
        </View>
      )}

      <Text style={styles.messageText}>{item.content}</Text>
      <View style={styles.bubbleFooter}>
        {item.is_edited && <Text style={styles.editedTag}>edited</Text>}
        <Text style={styles.messageTime}>
          {item.created_at && !isNaN(new Date(item.created_at).getTime()) 
            ? new Date(item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) 
            : ''}
        </Text>
      </View>
    </TouchableOpacity>
  );
});

// ── TeamChatModal ─────────────────────────────────────────────────────────
function TeamChatModal({
  team,
  onClose,
  currentUserId,
  messages,
  onSendMessage,
  loading,
  playVoiceNote,
  handlePickMedia,
  handleVoiceNote,
  isRecording,
  onDeleteMessage,
  onEditMessage,
}: {
  team: Team;
  onClose: () => void;
  currentUserId: string;
  messages: TeamMessage[];
  onSendMessage: (content?: string, attachmentId?: string, replyToId?: string) => Promise<void>;
  loading: boolean;
  playVoiceNote: (path: string) => Promise<void>;
  handlePickMedia: () => Promise<void>;
  handleVoiceNote: () => Promise<void>;
  isRecording: boolean;
  onDeleteMessage: (id: string) => Promise<void>;
  onEditMessage: (id: string, content: string) => Promise<void>;
}) {
  const insets = useSafeAreaInsets();
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [replyTo, setReplyTo] = useState<TeamMessage | null>(null);
  const [editingMessage, setEditingMessage] = useState<TeamMessage | null>(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'member'|'admin'>('member');
  const flatListRef = useRef<FlatList>(null);

  const handleInvite = async () => {
    if (!inviteEmail.trim()) return;
    try {
      const isEmail = inviteEmail.includes('@');
      const payload: any = { role: inviteRole };
      if (isEmail) payload.email = inviteEmail.trim();
      else payload.username = inviteEmail.trim();
      
      await TeamsService.inviteMember(team.id, payload);
      Alert.alert('Success', 'Invitation sent successfully');
      setShowInviteModal(false);
      setInviteEmail('');
    } catch (e: any) {
      Alert.alert('Error', e.message || 'Failed to send invitation');
    }
  };

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    setSending(true);
    if (editingMessage) {
      await onEditMessage(editingMessage.id, newMessage.trim());
      setEditingMessage(null);
    } else {
      await onSendMessage(newMessage.trim(), undefined, replyTo?.id);
      setReplyTo(null);
    }
    setNewMessage('');
    setSending(false);
  };

  const handleLongPress = (msg: TeamMessage) => {
    const isMe = msg.sender_id === currentUserId;
    Alert.alert(
      'Message Options',
      undefined,
      [
        { text: 'Reply', onPress: () => setReplyTo(msg) },
        { text: 'Copy', onPress: () => Alert.alert('Copied', 'Message copied to clipboard') },
        ...(isMe ? [
          { text: 'Edit', onPress: () => {
            setEditingMessage(msg);
            setNewMessage(msg.content);
          }},
          { text: 'Delete', onPress: () => {
            Alert.alert('Delete', 'Delete this message?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => onDeleteMessage(msg.id) }
            ]);
          }, style: 'destructive' }
        ] : []),
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 25}
      >
        <View style={styles.chatHeader}>
          <TouchableOpacity onPress={onClose} style={styles.chatBackBtn}>
            <Text style={styles.chatBackText}>← Back</Text>
          </TouchableOpacity>
          <View style={styles.chatHeaderInfo}>
            <Text style={styles.chatHeaderTitle} numberOfLines={1}>{team.name || 'Team Chat'}</Text>
            <Text style={styles.chatHeaderSub}>{team.my_role?.toUpperCase() || 'MEMBER'}</Text>
          </View>
          {(team.my_role === 'owner' || team.my_role === 'admin') && (
            <TouchableOpacity onPress={() => setShowInviteModal(true)} style={styles.headerActionBtn}>
              <Text style={styles.headerActionIcon}>➕</Text>
            </TouchableOpacity>
          )}
        </View>

        <Modal visible={showInviteModal} animationType="fade" transparent onRequestClose={() => setShowInviteModal(false)}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Invite Member</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Email or Username"
                placeholderTextColor="#666"
                value={inviteEmail}
                onChangeText={setInviteEmail}
                autoCapitalize="none"
              />
              <View style={styles.roleContainer}>
                <TouchableOpacity 
                  style={[styles.roleBtn, inviteRole === 'member' && styles.roleBtnActive]}
                  onPress={() => setInviteRole('member')}
                >
                  <Text style={styles.roleBtnText}>Member</Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.roleBtn, inviteRole === 'admin' && styles.roleBtnActive]}
                  onPress={() => setInviteRole('admin')}
                >
                  <Text style={styles.roleBtnText}>Admin</Text>
                </TouchableOpacity>
              </View>
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.modalCancel} onPress={() => setShowInviteModal(false)}>
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.modalSubmit} onPress={handleInvite}>
                  <Text style={styles.modalSubmitText}>Invite</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <View style={styles.messagesContainer}>
          {loading && messages.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator color="#f59e0b" />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={m => m?.id || Math.random().toString()}
              contentContainerStyle={styles.messagesList}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item }) => (
                <TeamMessageBubble
                  item={item}
                  currentUserId={currentUserId}
                  onLongPress={handleLongPress}
                  playVoiceNote={playVoiceNote}
                />
              )}
              ListEmptyComponent={
                !loading ? (
                  <View style={styles.emptyMsg}>
                    <Text style={styles.emptyMsgText}>No messages yet. Start the conversation!</Text>
                  </View>
                ) : null
              }
            />
          )}
        </View>

        {editingMessage && (
          <View style={styles.actionPreview}>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Editing Message</Text>
              <Text style={styles.actionText} numberOfLines={1}>{editingMessage.content}</Text>
            </View>
            <TouchableOpacity onPress={() => { setEditingMessage(null); setNewMessage(''); }} style={styles.actionClose}>
              <Text style={styles.actionCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {replyTo && (
          <View style={styles.actionPreview}>
            <View style={styles.actionInfo}>
              <Text style={styles.actionTitle}>Replying to {replyTo.sender_id === currentUserId ? 'yourself' : 'Member'}</Text>
              <Text style={styles.actionText} numberOfLines={1}>{replyTo.content}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.actionClose}>
              <Text style={styles.actionCloseText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <View style={styles.inputRow}>
            <TouchableOpacity style={styles.attachBtn} onPress={handlePickMedia}>
              <Text style={styles.attachIcon}>📎</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.messageInput}
              placeholder="Type a message..."
              placeholderTextColor="#555"
              value={newMessage}
              onChangeText={setNewMessage}
              multiline
            />
            {newMessage.trim() ? (
              <TouchableOpacity style={styles.sendBtn} onPress={handleSend} disabled={sending}>
                {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.sendBtnText}>↑</Text>}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.micBtn} onPress={handleVoiceNote}>
                <LinearGradient 
                  colors={isRecording ? ['#ef4444', '#dc2626'] : ['#6366f1', '#4f46e5']} 
                  style={styles.micGrad}
                >
                  <Text style={styles.micIcon}>{isRecording ? '⏹' : '🎤'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── TeamsScreen ───────────────────────────────────────────────────────────
export default function TeamsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<ChatStackParamList>>();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  const [teamMessages, setTeamMessages] = useState<Record<string, TeamMessage[]>>({});
  const [chatLoading, setChatLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioPlayer, setAudioPlayer] = useState<Audio.Sound | null>(null);
  const socketRef = useRef<Socket | null>(null);

  const loadData = useCallback(async () => {
    try {
      const user = await AuthService.getUser();
      setCurrentUserId(user?.id || '');
      const data = await TeamsService.getMyTeams();
      setTeams(data);
    } catch (e) {
      console.error('Failed to load teams', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const loadTeamMessages = async (teamId: string) => {
    setChatLoading(true);
    try {
      const cacheKey = `cache_team_messages_${teamId}`;
      const cached = await AsyncStorage.getItem(cacheKey);
      if (cached && !teamMessages[teamId]) {
        setTeamMessages(prev => ({ ...prev, [teamId]: JSON.parse(cached) }));
      }
      const res = await apiClient.get(`/teams/${teamId}/messages`);
      const data = Array.isArray(res.data) ? res.data : [];
      setTeamMessages(prev => ({ ...prev, [teamId]: data }));
      await AsyncStorage.setItem(cacheKey, JSON.stringify(data));
    } catch (e) {
      console.error('Load messages error:', e);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (activeTeam) {
      loadTeamMessages(activeTeam.id);
      const initSocket = async () => {
        const token = await AuthService.getToken();
        const socket = io(GATEWAY_URL, { auth: { token }, transports: ['websocket'] });
        socketRef.current = socket;
        socket.on('connect', () => socket.emit('team:join', activeTeam.id));
        socket.on('team:message', (msg: TeamMessage) => {
          setTeamMessages(prev => {
            const current = prev[activeTeam.id] || [];
            if (current.some(m => m.id === msg.id)) return prev;
            return { ...prev, [activeTeam.id]: [...current, msg] };
          });
        });
        socket.on('team:message_edited', (editedMsg: TeamMessage) => {
          setTeamMessages(prev => {
            const current = prev[activeTeam.id] || [];
            return { ...prev, [activeTeam.id]: current.map(m => m.id === editedMsg.id ? { ...m, ...editedMsg } : m) };
          });
        });
        socket.on('team:message_deleted', ({ messageId }: { messageId: string }) => {
          setTeamMessages(prev => {
            const current = prev[activeTeam.id] || [];
            return { ...prev, [activeTeam.id]: current.filter(m => m.id !== messageId) };
          });
        });
      };
      initSocket();
      return () => { socketRef.current?.disconnect(); socketRef.current = null; };
    }
  }, [activeTeam]);

  const handleSendMessage = async (content?: string, attachmentId?: string, replyToId?: string) => {
    if (!activeTeam) return;
    try {
      await apiClient.post(`/teams/${activeTeam.id}/messages`, { content, attachmentId, replyToId });
    } catch (e) { Alert.alert('Error', 'Failed to send message'); }
  };

  const handleDeleteMessage = async (messageId: string) => {
    try { await apiClient.delete(`/chat/messages/${messageId}`); }
    catch (e) { Alert.alert('Error', 'Failed to delete message'); }
  };

  const handleEditMessage = async (messageId: string, content: string) => {
    try { await apiClient.patch(`/chat/messages/${messageId}`, { content }); }
    catch (e) { Alert.alert('Error', 'Failed to edit message'); }
  };

  const handlePickMedia = async () => {
    if (!activeTeam) return;
    try {
      const asset = await MediaService.pickImage();
      if (!asset) return;
      setChatLoading(true);
      const attachment = await MediaService.uploadMedia(asset.uri, asset.fileName || 'team.jpg', asset.mimeType || 'image/jpeg', activeTeam.id);
      await handleSendMessage(`Team media: ${attachment.file_name}`, attachment.id);
    } catch (err: any) { Alert.alert('Upload Error', err.message); }
    finally { setChatLoading(false); }
  };

  const handleVoiceNote = async () => {
    if (!activeTeam) return;
    if (isRecording) {
      setIsRecording(false);
      try {
        setChatLoading(true);
        const attachment = await VoiceService.stopRecording(activeTeam.id);
        if (attachment) await handleSendMessage('Team Voice Note', attachment.id);
      } catch (err: any) { Alert.alert('Voice Note Error', err.message); }
      finally { setChatLoading(false); }
    } else {
      try { await VoiceService.startRecording(); setIsRecording(true); }
      catch (err: any) { Alert.alert('Recording Error', err.message); }
    }
  };

  const playVoiceNote = async (path: string) => {
    try {
      if (audioPlayer) await audioPlayer.unloadAsync();
      const res = await apiClient.get(`/media/signed-url?path=${path}`);
      const { sound } = await Audio.Sound.createAsync({ uri: res.data.url });
      setAudioPlayer(sound);
      await sound.playAsync();
    } catch (err) { console.error('Failed to play audio', err); }
  };

  const handleSupport = async () => {
    try {
      const res = await apiClient.post('/chat/support', { subject: 'Support Request' });
      if (res.data?.conversation) {
        navigation.navigate('Chat', { chat: res.data.conversation });
      } else if (res.data?.existingChatId) {
        navigation.navigate('Chat', { chat: { id: res.data.existingChatId, name: 'Support', type: 'direct', support_status: 'open', members: [] } as any });
      }
    } catch (error) { Alert.alert('Error', 'Failed to connect to Support'); }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Teams</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{teams.length} Hubs</Text>
        </View>
      </View>

      <FlatList
        data={teams}
        keyExtractor={item => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor="#f59e0b" />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.card} activeOpacity={0.8} onPress={() => setActiveTeam(item)}>
            <View style={styles.avatarWrap}>
              {item.avatar_url ? (
                <Image source={{ uri: `https://tngcvgisfctggvivcnva.supabase.co/storage/v1/object/public/team-avatars/${item.avatar_url}` }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Text style={styles.avatarText}>{(item.name || 'T').charAt(0).toUpperCase()}</Text>
                </View>
              )}
            </View>
            <View style={styles.info}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.role}>{item.my_role.toUpperCase()}</Text>
              {item.description && <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>}
            </View>
            <Text style={styles.chatHint}>💬</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={!loading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🏢</Text>
            <Text style={styles.emptyTitle}>No Teams Yet</Text>
            <Text style={styles.emptySub}>Create one or ask for an invite.</Text>
          </View>
        ) : <ActivityIndicator style={{ marginTop: 20 }} color="#f59e0b" />}
      />

      {activeTeam && (
        <TeamChatModal
          team={activeTeam}
          onClose={() => setActiveTeam(null)}
          currentUserId={currentUserId}
          messages={teamMessages[activeTeam.id] || []}
          onSendMessage={handleSendMessage}
          loading={chatLoading}
          playVoiceNote={playVoiceNote}
          handlePickMedia={handlePickMedia}
          handleVoiceNote={handleVoiceNote}
          isRecording={isRecording}
          onDeleteMessage={handleDeleteMessage}
          onEditMessage={handleEditMessage}
        />
      )}

      <TouchableOpacity style={styles.fabSupport} onPress={handleSupport}>
        <Text style={styles.fabSupportIcon}>💬</Text>
        <Text style={styles.fabSupportText}>Need Help?</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#111133' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800', flex: 1 },
  countBadge: { backgroundColor: '#f59e0b22', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4, borderWidth: 1, borderColor: '#f59e0b44' },
  countText: { color: '#f59e0b', fontWeight: '700', fontSize: 14 },
  list: { padding: 16 },
  card: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d1e', borderRadius: 18, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#111133' },
  avatarWrap: { marginRight: 16 },
  avatar: { width: 52, height: 52, borderRadius: 16 },
  avatarPlaceholder: { width: 52, height: 52, borderRadius: 16, backgroundColor: '#f59e0b22', justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#f59e0b44' },
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
  fabSupport: { position: 'absolute', bottom: 20, right: 20, backgroundColor: '#3b82f6', flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 30, elevation: 8 },
  fabSupportIcon: { fontSize: 18, marginRight: 6 },
  fabSupportText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  chatContainer: { flex: 1, backgroundColor: '#060611' },
  messagesContainer: { flex: 1 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 16, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#111133' },
  chatBackBtn: { marginRight: 16, padding: 4 },
  chatBackText: { color: '#f59e0b', fontSize: 15, fontWeight: '600' },
  chatHeaderInfo: { flex: 1 },
  chatHeaderTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  chatHeaderSub: { color: '#f59e0b', fontSize: 10, fontWeight: '700', marginTop: 2 },
  headerActionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#111133', justifyContent: 'center', alignItems: 'center' },
  headerActionIcon: { fontSize: 16 },
  messagesList: { padding: 16, paddingBottom: 8 },
  messageBubble: { maxWidth: '80%', padding: 12, borderRadius: 18, marginBottom: 10 },
  myBubble: { backgroundColor: '#6366f1', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: '#1a1a2e', alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#2a2a4e' },
  senderName: { color: '#f59e0b', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  messageText: { color: '#fff', fontSize: 15, lineHeight: 20 },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  editedTag: { color: 'rgba(255,255,255,0.3)', fontSize: 9, fontStyle: 'italic', marginRight: 4 },
  messageTime: { color: 'rgba(255,255,255,0.4)', fontSize: 10 },
  attachmentContainer: { marginBottom: 8, borderRadius: 12, overflow: 'hidden' },
  attachmentImage: { width: 200, height: 150, borderRadius: 12 },
  voiceNoteBtn: { backgroundColor: '#f59e0b22', padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#f59e0b44' },
  voiceNoteText: { color: '#f59e0b', fontWeight: 'bold' },
  attachmentFile: { color: '#f59e0b', fontSize: 13, textDecorationLine: 'underline' },
  replyContext: { backgroundColor: 'rgba(255,255,255,0.05)', borderLeftWidth: 3, borderLeftColor: '#f59e0b', padding: 6, borderRadius: 4, marginBottom: 6 },
  replyContextName: { color: '#f59e0b', fontSize: 11, fontWeight: '700', marginBottom: 2 },
  replyContextText: { color: '#aaa', fontSize: 11 },
  actionPreview: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d1e', padding: 10, borderTopWidth: 1, borderColor: '#111133' },
  actionInfo: { flex: 1 },
  actionTitle: { color: '#f59e0b', fontSize: 11, fontWeight: '700', marginBottom: 2 },
  actionText: { color: '#aaa', fontSize: 11 },
  actionClose: { width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
  actionCloseText: { color: '#666', fontSize: 16 },
  emptyMsg: { alignItems: 'center', paddingTop: 80 },
  emptyMsgText: { color: '#555', fontSize: 14 },
  inputContainer: { backgroundColor: '#0d0d1e', borderTopWidth: 1, borderColor: '#111133' },
  inputRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 10, gap: 8 },
  attachBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  attachIcon: { fontSize: 22, color: '#f59e0b' },
  messageInput: { flex: 1, backgroundColor: '#16162a', color: '#fff', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 24, maxHeight: 120, fontSize: 15, borderWidth: 1, borderColor: '#1e1e3a' },
  micBtn: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden' },
  micGrad: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  micIcon: { color: '#fff', fontSize: 18 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#f59e0b', justifyContent: 'center', alignItems: 'center' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' },
  modalContent: { width: '80%', backgroundColor: '#0d0d1e', borderRadius: 20, padding: 24, borderWidth: 1, borderColor: '#1e1e3a' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 20, textAlign: 'center' },
  modalInput: { backgroundColor: '#16162a', color: '#fff', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#1e1e3a', marginBottom: 16 },
  roleContainer: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  roleBtn: { flex: 1, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#1e1e3a', alignItems: 'center' },
  roleBtnActive: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
  roleBtnText: { color: '#fff', fontWeight: 'bold' },
  modalActions: { flexDirection: 'row', gap: 12 },
  modalCancel: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#1e1e3a', alignItems: 'center' },
  modalCancelText: { color: '#aaa', fontWeight: 'bold' },
  modalSubmit: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#3b82f6', alignItems: 'center' },
  modalSubmitText: { color: '#fff', fontWeight: 'bold' },
});
