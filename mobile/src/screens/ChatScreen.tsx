import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { io, Socket } from 'socket.io-client';
import apiClient from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import { AuthService } from '../services/AuthService';
import { Conversation } from '../services/ChatService';
import { API_URL, GATEWAY_URL } from '../Config';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { ChatStackParamList } from '../navigation/ChatStack';
import { MediaService } from '../services/MediaService';
import VoiceService from '../services/VoiceService';
import { Audio } from 'expo-av';

type Props = {
  navigation: NativeStackNavigationProp<ChatStackParamList, 'Chat'>;
  route: RouteProp<ChatStackParamList, 'Chat'>;
};

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  sender?: { full_name?: string; avatar_url?: string };
  attachment?: {
    id: string;
    file_type: string;
    storage_path: string;
    file_name: string;
  };
  type?: string;
  _optimistic?: boolean; // local-only flag for optimistic messages
}

export default function ChatScreen({ navigation, route }: Props) {
  const { conversationId, conversation } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const flatRef = useRef<FlatList>(null);
  const [audioPlayer, setAudioPlayer] = useState<Audio.Sound | null>(null);

  // Safe member access — conversation.members may be partial (no profile) when coming from createConversation
  const members = conversation?.members ?? [];
  const otherMember = members.find(m => m.user_id !== user?.id);
  const profile = otherMember?.profile;
  const [isOtherOnline, setIsOtherOnline] = useState(profile?.is_online || false);
  const recipientName = profile?.full_name || profile?.username || 'Chat';

  const fetchMessages = useCallback(async () => {
    try {
      const res = await apiClient.get(`/chat/conversations/${conversationId}/messages`);
      const data = Array.isArray(res.data) ? res.data : [];
      // Server returns oldest→newest; we want newest first for inverted FlatList
      setMessages([...data].reverse());
    } catch (e) {
      console.error('[ChatScreen] Failed to load messages:', e);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();

    // FIX: Use GATEWAY_URL (not API_URL) for the realtime socket connection
    const initSocket = async () => {
      try {
        const token = await AuthService.getToken();
        console.log('[ChatScreen] Connecting to gateway:', GATEWAY_URL);
        const socket = io(GATEWAY_URL, {
          auth: { token },
          transports: ['websocket'],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 2000,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          console.log('[ChatScreen] Socket connected to gateway successfully');
          socket.emit('chat:join', conversationId);
        });

        socket.on('connect_error', (err) => {
          console.error('[ChatScreen] Socket connection error:', err.message);
        });

        // Presence Update
        socket.on('user_online', ({ userId, online }) => {
          if (userId === otherMember?.user_id) {
            console.log(`[ChatScreen] Presence change: ${userId} is now ${online ? 'ONLINE' : 'OFFLINE'}`);
            setIsOtherOnline(online);
          }
        });

        // Incoming real-time message from another user
        socket.on('chat:message', (msg: Message) => {
          console.log('[ChatScreen] Received realtime message:', msg.id);
          // Avoid duplicates — ignore if we sent this (optimistic already added)
          setMessages(prev => {
            const isDuplicate = prev.some(m => m.id === msg.id);
            if (isDuplicate) return prev;
            return [msg, ...prev];
          });
        });

        socket.on('disconnect', (reason) => {
          console.warn('[ChatScreen] Socket disconnected:', reason);
        });
      } catch (err) {
        console.error('[ChatScreen] Socket init error:', err);
      }
    };

    initSocket();

    return () => {
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [conversationId, fetchMessages, otherMember?.user_id]);

  const sendMessage = async (overrideContent?: string, attachmentId?: string) => {
    const contentToSend = overrideContent || text.trim();
    if (!contentToSend && !attachmentId) return;
    if (sending) return;
    
    if (!overrideContent) setText('');
    setSending(true);

    // FIX: Optimistic update
    const optimisticId = `opt-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      content: contentToSend,
      sender_id: user?.id ?? '',
      created_at: new Date().toISOString(),
      _optimistic: true,
    };
    setMessages(prev => [optimisticMsg, ...prev]);

    try {
      const res = await apiClient.post(
        `/chat/conversations/${conversationId}/messages`,
        { content: contentToSend, attachmentId }
      );

      const serverMsg: Message = res.data;
      if (serverMsg?.id) {
        setMessages(prev =>
          prev.map(m => m.id === optimisticId ? { ...serverMsg } : m)
        );
      }
    } catch (e: any) {
      console.error('[ChatScreen] Send failed:', e);
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      if (!overrideContent) setText(contentToSend);
      Alert.alert('Send Failed', 'Could not send your message.');
    } finally {
      setSending(false);
    }
  };

  const handlePickMedia = async () => {
    try {
      const asset = await MediaService.pickImage();
      if (!asset) return;

      setLoading(true);
      const attachment = await MediaService.uploadMedia(
        asset.uri,
        asset.fileName || 'upload.jpg',
        asset.mimeType || 'image/jpeg',
        conversationId
      );
      
      await sendMessage(`Sent ${attachment.file_type}`, attachment.id);
    } catch (err: any) {
      Alert.alert('Upload Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleVoiceNote = async () => {
    if (isRecording) {
      setIsRecording(false);
      try {
        setLoading(true);
        const attachment = await VoiceService.stopRecording(conversationId);
        if (attachment) {
          await sendMessage('Voice Note', attachment.id);
        }
      } catch (err: any) {
        Alert.alert('Voice Note Error', err.message);
      } finally {
        setLoading(false);
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
      if (audioPlayer) {
        await audioPlayer.unloadAsync();
      }

      // Get signed URL
      const res = await apiClient.get(`/media/signed-url?path=${path}`);
      const { sound } = await Audio.Sound.createAsync({ uri: res.data.url });
      setAudioPlayer(sound);
      await sound.playAsync();
    } catch (err) {
      console.error('Failed to play audio', err);
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const isMe = item.sender_id === user?.id;
    return (
      <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
        {!isMe && (
          <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.msgAvatar}>
            <Text style={styles.msgAvatarText}>{recipientName.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
        )}
        <View style={[
          styles.bubble,
          isMe ? styles.bubbleMe : styles.bubbleThem,
          item._optimistic && styles.bubbleOptimistic,
        ]}>
          {item.attachment && (
            <View style={styles.attachmentContainer}>
              {item.attachment.file_type.startsWith('image') ? (
                <Image 
                  source={{ uri: `https://tngcvgisfctggvivcnva.supabase.co/storage/v1/object/public/chat-media/${item.attachment.storage_path}` }} 
                  style={styles.attachmentImage as any} 
                />
              ) : item.attachment.file_type.startsWith('audio') ? (
                <TouchableOpacity onPress={() => playVoiceNote(item.attachment!.storage_path)} style={styles.voiceNoteBtn}>
                  <Text style={styles.voiceNoteText}>▶ Voice Note</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.attachmentFile}>📎 {item.attachment.file_name}</Text>
              )}
            </View>
          )}
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.content}</Text>
          <Text style={styles.bubbleTime}>
            {item._optimistic
              ? 'Sending…'
              : new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : -20}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
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

        {/* Call Buttons */}
        <View style={styles.headerActions}>
          <TouchableOpacity 
            onPress={() => navigation.navigate('Call', { 
              type: 'audio', 
              conversationId, 
              targetUserId: otherMember?.user_id || '', 
              targetName: recipientName,
              isIncoming: false 
            })} 
            style={styles.headerActionBtn}
          >
            <Text style={styles.headerActionIcon}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            onPress={() => navigation.navigate('Call', { 
              type: 'video', 
              conversationId, 
              targetUserId: otherMember?.user_id || '', 
              targetName: recipientName,
              isIncoming: false 
            })} 
            style={styles.headerActionBtn}
          >
            <Text style={styles.headerActionIcon}>📹</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#6366f1" /></View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={i => i.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={styles.msgList}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>No messages yet. Say hello! 👋</Text>
            </View>
          }
        />
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TouchableOpacity style={styles.attachBtn} onPress={handlePickMedia}>
          <Text style={styles.attachIcon}>📎</Text>
        </TouchableOpacity>

        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#444"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
          returnKeyType="default"
        />

        {text.trim() ? (
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={() => sendMessage()}
            disabled={sending || !text.trim()}
          >
            <LinearGradient
              colors={sending ? ['#333', '#222'] : ['#6366f1', '#4f46e5']}
              style={styles.sendGrad}
            >
              <Text style={styles.sendIcon}>{sending ? '…' : '➤'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.micBtn} onPress={handleVoiceNote}>
            <LinearGradient 
              colors={isRecording ? ['#ef4444', '#dc2626'] : ['#6366f1', '#4f46e5']} 
              style={styles.sendGrad}
            >
              <Text style={styles.sendIcon}>{isRecording ? '⏹' : '🎤'}</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderColor: '#111133', backgroundColor: '#060611',
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
  headerActionBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#111133', justifyContent: 'center', alignItems: 'center' },
  headerActionIcon: { fontSize: 18 },
  msgList: { padding: 16, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgAvatar: {
    width: 30, height: 30, borderRadius: 15,
    justifyContent: 'center', alignItems: 'center', marginRight: 8,
  },
  msgAvatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  bubble: { maxWidth: '75%', borderRadius: 18, padding: 12, paddingHorizontal: 16 },
  bubbleMe: { backgroundColor: '#4f46e5', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#111133', borderBottomLeftRadius: 4 },
  bubbleOptimistic: { opacity: 0.7 },
  bubbleText: { color: '#ccc', fontSize: 15, lineHeight: 21 },
  bubbleTextMe: { color: '#fff' },
  bubbleTime: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 4, textAlign: 'right' },
  attachmentContainer: { marginBottom: 8, borderRadius: 8, overflow: 'hidden' },
  attachmentImage: { width: 200, height: 150, borderRadius: 8, backgroundColor: '#222' },
  voiceNoteBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', padding: 8, borderRadius: 8 },
  voiceNoteText: { color: '#fff', fontSize: 14 },
  attachmentFile: { color: '#6366f1', fontSize: 14, textDecorationLine: 'underline' },
  emptyChat: { alignItems: 'center', paddingTop: 60 },
  emptyChatText: { color: '#444', fontSize: 14 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 16,
    borderTopWidth: 1,
    borderColor: '#111133',
    backgroundColor: '#060611',
    gap: 8,
  },
  attachBtn: { width: 44, height: 48, justifyContent: 'center', alignItems: 'center' },
  attachIcon: { fontSize: 24, color: '#6366f1' },
  input: {
    flex: 1,
    backgroundColor: '#0d0d1e',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    color: '#fff',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#111133',
    maxHeight: 120,
    minHeight: 48,
  },
  micBtn: { borderRadius: 24, overflow: 'hidden' },
  sendBtn: { borderRadius: 24, overflow: 'hidden' },
  sendBtnDisabled: { opacity: 0.5 },
  sendGrad: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 24 },
  sendIcon: { color: '#fff', fontSize: 18 },
});
