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
import { useLongPressGesture } from '../hooks/useLongPressGesture';

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
  _optimistic?: boolean; 
  is_edited?: boolean;
  reply_to?: {
    id: string;
    content: string;
    sender_id: string;
  };
}

// ── ChatMessageBubble ────────────────────────────────────────────────────
// Must live OUTSIDE ChatScreen so useLongPressGesture follows Rules of Hooks.
const ChatMessageBubble = React.memo(({
  item,
  currentUserId,
  recipientName,
  onLongPress,
  onPlayAudio,
}: {
  item: Message;
  currentUserId: string;
  recipientName: string;
  onLongPress: (msg: Message) => void;
  onPlayAudio: (path: string) => void;
}) => {
  const isMe = item.sender_id === currentUserId;

  const longPressProps = useLongPressGesture({
    onLongPress: () => onLongPress(item),
    delay: 500,
    moveThreshold: 10,
  });

  return (
    <View style={[styles.msgRow, isMe && styles.msgRowMe]}>
      {!isMe && (
        <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.msgAvatar}>
          <Text style={styles.msgAvatarText}>{recipientName.charAt(0).toUpperCase()}</Text>
        </LinearGradient>
      )}
      <TouchableOpacity
        activeOpacity={0.85}
        {...longPressProps}
        style={[
          styles.bubble,
          isMe ? styles.bubbleMe : styles.bubbleThem,
          item._optimistic && styles.bubbleOptimistic,
        ]}
      >
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
        {item.attachment && (
          <View style={styles.attachmentContainer}>
            {item.attachment.file_type.startsWith('image') ? (
              <Image
                source={{ uri: `https://tngcvgisfctggvivcnva.supabase.co/storage/v1/object/public/chat-media/${item.attachment.storage_path}` }}
                style={styles.attachmentImage as any}
              />
            ) : item.attachment.file_type.startsWith('audio') ? (
              <TouchableOpacity onPress={() => onPlayAudio(item.attachment!.storage_path)} style={styles.voiceNoteBtn}>
                <Text style={styles.voiceNoteText}>▶ Voice Note</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.attachmentFile}>📎 {item.attachment.file_name}</Text>
            )}
          </View>
        )}
        <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.content}</Text>
        <View style={styles.bubbleFooter}>
          {item.is_edited && <Text style={styles.editedTag}>edited</Text>}
          <Text style={styles.bubbleTime}>
            {item._optimistic
              ? 'Sending…'
              : new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
});

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
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);

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
          setMessages(prev => {
            const isDuplicate = prev.some(m => m.id === msg.id);
            if (isDuplicate) return prev;
            return [msg, ...prev];
          });
        });

        socket.on('chat:message_edited', (editedMsg: Message) => {
          setMessages(prev => prev.map(m => m.id === editedMsg.id ? { ...m, ...editedMsg } : m));
        });

        socket.on('chat:message_deleted', ({ messageId }: { messageId: string }) => {
          setMessages(prev => prev.filter(m => m.id !== messageId));
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

  const deleteMessage = async (messageId: string) => {
    try {
      await apiClient.delete(`/chat/messages/${messageId}`);
    } catch (e) {
      Alert.alert('Error', 'Failed to delete message');
    }
  };

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
      if (editingMessage) {
        await apiClient.patch(`/chat/messages/${editingMessage.id}`, { content: contentToSend });
        setEditingMessage(null);
      } else {
        const res = await apiClient.post(
          `/chat/conversations/${conversationId}/messages`,
          { content: contentToSend, attachmentId, replyToId: replyTo?.id }
        );

        const serverMsg: Message = res.data;
        if (serverMsg?.id) {
          setMessages(prev =>
            prev.map(m => m.id === optimisticId ? { ...serverMsg } : m)
          );
        }
        setReplyTo(null);
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

  const handleLongPress = (msg: Message) => {
    const isMe = msg.sender_id === user?.id;
    const options = ['Reply', 'Copy'];
    if (isMe) options.push('Edit', 'Delete');
    options.push('Cancel');

    Alert.alert(
      'Message Options',
      undefined,
      [
        { text: 'Reply', onPress: () => setReplyTo(msg) },
        { 
          text: 'Copy', 
          onPress: () => {
            // In a real app we'd use Clipboard from expo-clipboard
            Alert.alert('Copied', 'Message copied to clipboard');
          } 
        },
        ...(isMe ? [
          { text: 'Edit', onPress: () => {
            setEditingMessage(msg);
            setText(msg.content);
          }},
          { text: 'Delete', onPress: () => {
            Alert.alert('Delete', 'Delete this message?', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: () => deleteMessage(msg.id) }
            ]);
          }, style: 'destructive' }
        ] : []),
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const renderMessage = useCallback(({ item }: { item: Message }) => (
    <ChatMessageBubble
      item={item}
      currentUserId={user?.id ?? ''}
      recipientName={recipientName}
      onLongPress={handleLongPress}
      onPlayAudio={playVoiceNote}
    />
  ), [user?.id, recipientName, handleLongPress, playVoiceNote]);

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

      {/* Action Previews */}
      {editingMessage && (
        <View style={styles.actionPreview}>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>Editing Message</Text>
            <Text style={styles.actionText} numberOfLines={1}>{editingMessage.content}</Text>
          </View>
          <TouchableOpacity onPress={() => { setEditingMessage(null); setText(''); }} style={styles.actionClose}>
            <Text style={styles.actionCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {replyTo && (
        <View style={styles.actionPreview}>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>Replying to {replyTo.sender_id === user?.id ? 'yourself' : 'Member'}</Text>
            <Text style={styles.actionText} numberOfLines={1}>{replyTo.content}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.actionClose}>
            <Text style={styles.actionCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
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
  bubbleTextMe: { color: '#fff' },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  editedTag: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontStyle: 'italic', marginRight: 4 },
  bubbleTime: { color: 'rgba(255,255,255,0.4)', fontSize: 10 },
  replyContext: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderLeftWidth: 3,
    borderLeftColor: '#6366f1',
    padding: 6,
    borderRadius: 4,
    marginBottom: 6,
  },
  replyContextName: { color: '#6366f1', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  replyContextText: { color: '#aaa', fontSize: 12 },
  actionPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d0d1e',
    padding: 12,
    borderTopWidth: 1,
    borderColor: '#111133',
  },
  actionInfo: { flex: 1 },
  actionTitle: { color: '#6366f1', fontSize: 12, fontWeight: '700', marginBottom: 2 },
  actionText: { color: '#aaa', fontSize: 12 },
  actionClose: { width: 32, height: 32, justifyContent: 'center', alignItems: 'center' },
  actionCloseText: { color: '#666', fontSize: 18 },
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
