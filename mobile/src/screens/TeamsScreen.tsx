import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Image, Alert, Modal,
  TextInput, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
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
  team, onClose, currentUserId, messages, onSendMessage, loading, playVoiceNote, handlePickMedia, handleVoiceNote, isRecording
}: {
  team: Team; 
  onClose: () => void; 
  currentUserId: string;
  messages: TeamMessage[];
  onSendMessage: (content?: string, attachmentId?: string) => Promise<void>;
  loading: boolean;
  playVoiceNote: (path: string) => Promise<void>;
  handlePickMedia: () => Promise<void>;
  handleVoiceNote: () => Promise<void>;
  isRecording: boolean;
}) {
  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  const handleSend = async () => {
    if (!newMessage.trim() || sending) return;
    setSending(true);
    await onSendMessage(newMessage.trim());
    setNewMessage('');
    setSending(false);
  };

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.chatContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -20}
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

        <View style={styles.messagesContainer}>
          {loading && messages.length === 0 ? (
            <View style={styles.center}>
              <ActivityIndicator color="#f59e0b" />
            </View>
          ) : (
            <FlatList
              ref={flatListRef}
              data={messages}
              keyExtractor={m => m.id}
              contentContainerStyle={styles.messagesList}
              onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
              renderItem={({ item }) => {
                const isMe = item.sender_id === currentUserId;
                const senderName = item.profiles?.full_name || item.profiles?.username || 'Unknown';
                const attachment = (item as any).attachment;

                return (
                  <View style={[styles.messageBubble, isMe ? styles.myBubble : styles.theirBubble]}>
                    {!isMe && <Text style={styles.senderName}>{senderName}</Text>}
                    
                    {attachment && (
                      <View style={styles.attachmentContainer}>
                        {attachment.file_type.startsWith('image') ? (
                          <Image 
                            source={{ uri: `https://tngcvgisfctggvivcnva.supabase.co/storage/v1/object/public/chat-media/${attachment.storage_path}` }} 
                            style={styles.attachmentImage as any} 
                          />
                        ) : attachment.file_type.startsWith('audio') ? (
                          <TouchableOpacity 
                            style={styles.voiceNoteBtn} 
                            onPress={() => playVoiceNote(attachment.storage_path)}
                          >
                            <Text style={styles.voiceNoteText}>▶ Voice Note</Text>
                          </TouchableOpacity>
                        ) : (
                          <Text style={styles.attachmentFile}>📎 {attachment.file_name}</Text>
                        )}
                      </View>
                    )}

                    <Text style={styles.messageText}>{item.content}</Text>
                    <Text style={styles.messageTime}>
                      {new Date(item.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  </View>
                );
              }}
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

        <View style={styles.inputContainer}>
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
              textAlignVertical="center"
            />
            
            {newMessage.trim() ? (
              <TouchableOpacity
                style={[styles.sendBtn, !newMessage.trim() && styles.sendBtnDisabled]}
                onPress={handleSend}
                disabled={sending || !newMessage.trim()}
              >
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

export default function TeamsScreen() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTeam, setActiveTeam] = useState<Team | null>(null);
  const [currentUserId, setCurrentUserId] = useState('');
  
  // Per-team message cache to prevent "wipe-off"
  const [teamMessages, setTeamMessages] = useState<Record<string, TeamMessage[]>>({});
  const [chatLoading, setChatLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [audioPlayer, setAudioPlayer] = useState<Audio.Sound | null>(null);

  const load = useCallback(async () => {
    const user = await AuthService.getUser();
    setCurrentUserId(user?.id || '');
    const data = await TeamsService.getMyTeams();
    setTeams(data);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadTeamMessages = async (teamId: string) => {
    if (!teamId) return;
    setChatLoading(true);
    try {
      const res = await apiClient.get(`/teams/${teamId}/messages`);
      setTeamMessages(prev => ({ ...prev, [teamId]: res.data || [] }));
    } catch (e) {
      console.error('[TeamsScreen] Load messages error:', e);
    } finally {
      setChatLoading(false);
    }
  };

  useEffect(() => {
    if (activeTeam) {
      loadTeamMessages(activeTeam.id);
    }
  }, [activeTeam]);

  const handleSendMessage = async (content?: string, attachmentId?: string) => {
    if (!activeTeam) return;
    try {
      await apiClient.post(`/teams/${activeTeam.id}/messages`, { content, attachmentId });
      loadTeamMessages(activeTeam.id);
    } catch (e) {
      Alert.alert('Error', 'Failed to send message');
    }
  };

  const handlePickMedia = async () => {
    if (!activeTeam) return;
    try {
      const asset = await MediaService.pickImage();
      if (!asset) return;
      setChatLoading(true);
      const attachment = await MediaService.uploadMedia(
        asset.uri, asset.fileName || 'team.jpg', asset.mimeType || 'image/jpeg', activeTeam.id
      );
      await handleSendMessage(`Team media: ${attachment.file_name}`, attachment.id);
    } catch (err: any) {
      Alert.alert('Upload Error', err.message);
    } finally {
      setChatLoading(false);
    }
  };

  const handleVoiceNote = async () => {
    if (!activeTeam) return;
    if (isRecording) {
      setIsRecording(false);
      try {
        setChatLoading(true);
        const attachment = await VoiceService.stopRecording(activeTeam.id);
        if (attachment) await handleSendMessage('Team Voice Note', attachment.id);
      } catch (err: any) {
        Alert.alert('Voice Note Error', err.message);
      } finally {
        setChatLoading(false);
      }
    } else {
      try {
        await VoiceService.startRecording();
        setIsRecording(true);
      } catch (err: any) {
        Alert.alert('Recording Error', err.message);
      }
    }
  };

  const playVoiceNote = async (path: string) => {
    try {
      if (audioPlayer) await audioPlayer.unloadAsync();
      const res = await apiClient.get(`/media/signed-url?path=${path}`);
      const { sound } = await Audio.Sound.createAsync({ uri: res.data.url });
      setAudioPlayer(sound);
      await sound.playAsync();
    } catch (err) {
      console.error('Failed to play audio', err);
    }
  };

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
          messages={teamMessages[activeTeam.id] || []}
          onSendMessage={handleSendMessage}
          loading={chatLoading}
          playVoiceNote={playVoiceNote}
          handlePickMedia={handlePickMedia}
          handleVoiceNote={handleVoiceNote}
          isRecording={isRecording}
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
  messagesContainer: { flex: 1 },
  chatHeader: {
    flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 16,
    paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#111133',
  },
  chatBackBtn: { marginRight: 16, padding: 4 },
  chatBackText: { color: '#f59e0b', fontSize: 15, fontWeight: '600' },
  chatHeaderInfo: { flex: 1 },
  chatHeaderTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  chatHeaderSub: { color: '#f59e0b', fontSize: 10, fontWeight: '700', marginTop: 2 },
  headerActions: { flexDirection: 'row', gap: 10 },
  headerActionBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#111133', justifyContent: 'center', alignItems: 'center' },
  headerActionIcon: { fontSize: 16 },
  messagesList: { padding: 16, paddingBottom: 8 },
  messageBubble: {
    maxWidth: '80%', padding: 12, borderRadius: 18, marginBottom: 10,
  },
  myBubble: { backgroundColor: '#6366f1', alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  theirBubble: { backgroundColor: '#1a1a2e', alignSelf: 'flex-start', borderBottomLeftRadius: 4, borderWidth: 1, borderColor: '#2a2a4e' },
  senderName: { color: '#f59e0b', fontSize: 11, fontWeight: '700', marginBottom: 4 },
  messageText: { color: '#fff', fontSize: 14, lineHeight: 20 },
  messageTime: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 4, alignSelf: 'flex-end' },
  attachmentContainer: { marginBottom: 8, borderRadius: 8, overflow: 'hidden' },
  attachmentImage: { width: 180, height: 120, borderRadius: 8, backgroundColor: '#222' },
  voiceNoteBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', padding: 6, borderRadius: 8 },
  voiceNoteText: { color: '#fff', fontSize: 13 },
  attachmentFile: { color: '#f59e0b', fontSize: 13, textDecorationLine: 'underline' },
  emptyMsg: { alignItems: 'center', paddingTop: 80 },
  emptyMsgText: { color: '#555', fontSize: 14 },
  inputContainer: {
    backgroundColor: '#0d0d1e',
    borderTopWidth: 1, 
    borderColor: '#111133', 
    paddingBottom: Platform.OS === 'ios' ? 34 : 12,
  },
  inputRow: {
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 12,
    paddingTop: 10,
    gap: 8,
  },
  attachBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  attachIcon: { fontSize: 22, color: '#f59e0b' },
  messageInput: {
    flex: 1, 
    backgroundColor: '#16162a', 
    color: '#fff', 
    paddingHorizontal: 16,
    paddingVertical: 10, 
    borderRadius: 24,
    maxHeight: 120, 
    fontSize: 15, 
    borderWidth: 1, 
    borderColor: '#1e1e3a',
  },
  micBtn: { width: 46, height: 46, borderRadius: 23, overflow: 'hidden' },
  micGrad: { width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' },
  micIcon: { color: '#fff', fontSize: 18 },
  sendBtn: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: '#f59e0b',
    justifyContent: 'center', alignItems: 'center',
  },
  sendBtnDisabled: { backgroundColor: '#333' },
  sendBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
