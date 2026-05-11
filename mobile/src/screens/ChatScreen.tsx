import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { io, Socket } from 'socket.io-client';
import apiClient from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import { AuthService } from '../services/AuthService';
import { Conversation } from '../services/ChatService';
import { API_URL } from '../Config';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { ChatStackParamList } from '../navigation/ChatStack';

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
}

export default function ChatScreen({ navigation, route }: Props) {
  const { conversationId, conversation } = route.params;
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const flatRef = useRef<FlatList>(null);

  const otherMember = conversation.members.find(m => m.user_id !== user?.id);
  const profile = otherMember?.profile;
  const recipientName = profile?.full_name || profile?.username || 'Chat';

  const fetchMessages = useCallback(async () => {
    try {
      const res = await apiClient.get(`/chat/conversations/${conversationId}/messages`);
      setMessages(res.data.reverse());
    } catch (e) {
      console.error('[ChatScreen] Failed to load messages:', e);
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    fetchMessages();

    // Socket.io real-time connection
    const initSocket = async () => {
      const token = await AuthService.getToken();
      const socket = io(API_URL, {
        auth: { token },
        transports: ['websocket'],
      });
      socketRef.current = socket;
      socket.emit('chat:join', conversationId);
      socket.on('chat:message', (msg: Message) => {
        setMessages(prev => [msg, ...prev]);
      });
    };
    initSocket();

    return () => {
      socketRef.current?.disconnect();
    };
  }, [conversationId, fetchMessages]);

  const sendMessage = async () => {
    if (!text.trim() || sending) return;
    const content = text.trim();
    setText('');
    setSending(true);
    try {
      await apiClient.post(
        `/chat/conversations/${conversationId}/messages`,
        { content }
      );
    } catch (e) {
      console.error('[ChatScreen] Send failed:', e);
      setText(content); // restore on failure
    } finally {
      setSending(false);
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
        <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.content}</Text>
          <Text style={styles.bubbleTime}>
            {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        {profile?.avatar_url ? (
          <Image source={{ uri: profile.avatar_url }} style={styles.headerAvatar} />
        ) : (
          <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.headerAvatar}>
            <Text style={styles.headerAvatarText}>{recipientName.charAt(0).toUpperCase()}</Text>
          </LinearGradient>
        )}
        <View style={styles.headerInfo}>
          <Text style={styles.headerName}>{recipientName}</Text>
          <Text style={styles.headerStatus}>● Online</Text>
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
        />
      )}

      {/* Input */}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Type a message..."
          placeholderTextColor="#444"
          value={text}
          onChangeText={setText}
          multiline
          maxLength={2000}
        />
        <TouchableOpacity style={styles.sendBtn} onPress={sendMessage} disabled={sending || !text.trim()}>
          <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.sendGrad}>
            <Text style={styles.sendIcon}>{sending ? '…' : '➤'}</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingTop: 56, paddingBottom: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderColor: '#111133', backgroundColor: '#060611' },
  backBtn: { marginRight: 12, padding: 4 },
  backText: { color: '#6366f1', fontSize: 32, lineHeight: 32 },
  headerAvatar: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  headerAvatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  headerInfo: { flex: 1 },
  headerName: { color: '#fff', fontSize: 17, fontWeight: '700' },
  headerStatus: { color: '#10b981', fontSize: 12, marginTop: 2 },
  msgList: { padding: 16, paddingBottom: 8 },
  msgRow: { flexDirection: 'row', alignItems: 'flex-end', marginBottom: 12 },
  msgRowMe: { justifyContent: 'flex-end' },
  msgAvatar: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  msgAvatarText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  bubble: { maxWidth: '75%', borderRadius: 18, padding: 12, paddingHorizontal: 16 },
  bubbleMe: { backgroundColor: '#4f46e5', borderBottomRightRadius: 4 },
  bubbleThem: { backgroundColor: '#111133', borderBottomLeftRadius: 4 },
  bubbleText: { color: '#ccc', fontSize: 15, lineHeight: 21 },
  bubbleTextMe: { color: '#fff' },
  bubbleTime: { color: 'rgba(255,255,255,0.4)', fontSize: 10, marginTop: 4, textAlign: 'right' },
  inputRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 12, 
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 34 : 12, 
    borderTopWidth: 1, 
    borderColor: '#111133', 
    backgroundColor: '#060611',
    gap: 8,
  },
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
  },
  sendBtn: { borderRadius: 24, overflow: 'hidden' },
  sendGrad: { width: 48, height: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 24 },
  sendIcon: { color: '#fff', fontSize: 18 },
});
