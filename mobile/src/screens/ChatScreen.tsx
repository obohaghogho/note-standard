import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image,
  Alert, Share, Animated, PanResponder, Modal,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { io, Socket } from 'socket.io-client';
import apiClient from '../api/apiClient';
import { useAuth } from '../context/AuthContext';
import { AuthService } from '../services/AuthService';
import { Conversation } from '../services/ChatService';
import { GATEWAY_URL } from '../Config';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { ChatStackParamList } from '../navigation/ChatStack';
import { MediaService } from '../services/MediaService';
import VoiceService from '../services/VoiceService';
import { Audio } from 'expo-av';
import SignalingService from '../services/SignalingService';

type Props = {
  navigation: NativeStackNavigationProp<ChatStackParamList, 'Chat'>;
  route: RouteProp<ChatStackParamList, 'Chat'>;
};

interface Message {
  id: string;
  content: string;
  sender_id: string;
  created_at: string;
  sender?: { full_name?: string; avatar_url?: string; username?: string };
  attachment?: {
    id: string;
    file_type: string;
    storage_path: string;
    file_name: string;
  };
  type?: string;
  _optimistic?: boolean;
  is_edited?: boolean;
  /** Raw FK from DB — present when no JOIN was performed */
  reply_to_id?: string;
  /** Resolved reply-to object — present after JOIN or manual hydration */
  reply_to?: {
    id: string;
    content: string;
    sender_id: string;
    /** Pre-resolved sender display name (from profiles JOIN) */
    sender_name?: string;
    /** Original message type, used for media-type labels in reply bubble */
    message_type?: string;
    /** True when the original message was soft-deleted */
    deleted?: boolean;
  };
}

// ── MessageActionSheet ──────────────────────────────────────────────────
const MessageActionSheet = React.memo(({
  message, currentUserId, onClose, onReply, onCopy, onShare, onEdit, onDelete,
}: {
  message: Message | null;
  currentUserId: string;
  onClose: () => void;
  onReply: (m: Message) => void;
  onCopy: (m: Message) => void;
  onShare: (m: Message) => void;
  onEdit: (m: Message) => void;
  onDelete: (m: Message) => void;
}) => {
  const isMe = message?.sender_id === currentUserId;
  if (!message) return null;
  const actions = [
    { icon: '↩', label: 'Reply', color: '#6366f1', onPress: () => { onReply(message); onClose(); } },
    { icon: '📋', label: 'Copy', color: '#10b981', onPress: () => { onCopy(message); onClose(); } },
    { icon: '↗', label: 'Share', color: '#3b82f6', onPress: () => { onShare(message); onClose(); } },
    ...(isMe && !message._optimistic ? [
      { icon: '✏', label: 'Edit', color: '#f59e0b', onPress: () => { onEdit(message); onClose(); } },
      { icon: '🗑', label: 'Delete', color: '#ef4444', danger: true, onPress: () => { onDelete(message); onClose(); } },
    ] : []),
  ];
  return (
    <Modal transparent animationType="slide" visible statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={asStyles.overlay} onPress={onClose} activeOpacity={1}>
        <View style={asStyles.sheet}>
          <View style={asStyles.handle} />
          <View style={asStyles.preview}>
            <Text style={asStyles.previewLabel}>{isMe ? 'Your message' : 'Message'}</Text>
            <Text style={asStyles.previewText} numberOfLines={2}>{message.content || '📎 Attachment'}</Text>
          </View>
          <View style={asStyles.grid}>
            {actions.map((a, i) => (
              <TouchableOpacity key={i} style={asStyles.actionBtn} onPress={a.onPress} activeOpacity={0.7}>
                <View style={[asStyles.actionIconWrap, { backgroundColor: a.color + '22' }]}>
                  <Text style={asStyles.actionIcon}>{a.icon}</Text>
                </View>
                <Text style={[asStyles.actionLabel, (a as any).danger && { color: '#ef4444' }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={asStyles.cancelBtn} onPress={onClose}>
            <Text style={asStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
});

// ── ChatMessageBubble ────────────────────────────────────────────────────
const ChatMessageBubble = React.memo(({
  item, currentUserId, recipientName, onLongPress, onSwipeRight, onPlayAudio,
}: {
  item: Message;
  currentUserId: string;
  recipientName: string;
  onLongPress: (msg: Message) => void;
  onSwipeRight?: (msg: Message) => void;
  onPlayAudio: (path: string) => void;
}) => {
  const isMe = item.sender_id === currentUserId;
  const swipeX = useRef(new Animated.Value(0)).current;
  const swipeFired = useRef(false);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gs) =>
      Math.abs(gs.dx) > 8 && Math.abs(gs.dy) < Math.abs(gs.dx) * 0.9,
    onPanResponderGrant: () => { swipeFired.current = false; },
    onPanResponderMove: (_, gs) => {
      if (gs.dx > 0) swipeX.setValue(Math.min(gs.dx, 75));
    },
    onPanResponderRelease: (_, gs) => {
      if (gs.dx > 50 && !swipeFired.current && onSwipeRight) {
        swipeFired.current = true;
        onSwipeRight(item);
      }
      Animated.spring(swipeX, { toValue: 0, useNativeDriver: true, tension: 50, friction: 8 }).start();
    },
    onPanResponderTerminate: () => {
      Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start();
    },
  })).current;

  const replyOpacity = swipeX.interpolate({ inputRange: [10, 55], outputRange: [0, 1], extrapolate: 'clamp' });
  const replyScale = swipeX.interpolate({ inputRange: [10, 55], outputRange: [0.4, 1], extrapolate: 'clamp' });

  const renderTicks = (msg: Message & { delivered_at?: string; read_at?: string }) => {
    if (!isMe) return null;
    if (msg._optimistic) return <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{'  ✓'}</Text>;
    if ((msg as any).read_at) return <Text style={{ color: '#60a5fa', fontSize: 10 }}>{'  ✓✓'}</Text>;
    if ((msg as any).delivered_at) return <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>{'  ✓✓'}</Text>;
    return <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{'  ✓'}</Text>;
  };

  return (
    <View style={[styles.msgRow, isMe && styles.msgRowMe]} {...panResponder.panHandlers}>
      {/* Swipe-to-reply arrow indicator */}
      <Animated.View style={[
        styles.replyIndicator,
        isMe ? styles.replyIndicatorRight : styles.replyIndicatorLeft,
        { opacity: replyOpacity, transform: [{ scale: replyScale }] },
      ]}>
        <Text style={styles.replyIndicatorIcon}>↩</Text>
      </Animated.View>

      {!isMe && (
        <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.msgAvatar}>
          <Text style={styles.msgAvatarText}>{recipientName.charAt(0).toUpperCase()}</Text>
        </LinearGradient>
      )}
      <Animated.View style={{ transform: [{ translateX: swipeX }] }}>
        <TouchableOpacity
          activeOpacity={0.85}
          onLongPress={() => onLongPress(item)}
          delayLongPress={400}
          style={[
            styles.bubble,
            isMe ? styles.bubbleMe : styles.bubbleThem,
            item._optimistic && styles.bubbleOptimistic,
          ]}
        >
          {item.reply_to && (
            <View style={styles.replyContext}>
              {/* Accent bar */}
              <View style={styles.replyContextBar} />
              <View style={styles.replyContextBody}>
                <Text style={styles.replyContextName}>
                  {item.reply_to.sender_id === currentUserId
                    ? 'You'
                    : item.reply_to.sender_name || recipientName}
                </Text>
                <Text style={styles.replyContextText} numberOfLines={1}>
                  {item.reply_to.deleted
                    ? '🚫 Original message was deleted'
                    : item.reply_to.message_type === 'image'  ? '📷 Photo'
                    : item.reply_to.message_type === 'video'  ? '🎥 Video'
                    : item.reply_to.message_type === 'audio'  ? '🎤 Voice note'
                    : item.reply_to.message_type === 'document' ? '📄 Document'
                    : item.reply_to.content}
                </Text>
              </View>
            </View>
          )}
          {item.attachment && (
            <View style={styles.attachmentContainer}>
              {item.attachment.file_type?.startsWith('image') ? (
                <Image
                  source={{ uri: `https://tngcvgisfctggvivcnva.supabase.co/storage/v1/object/public/chat-media/${item.attachment.storage_path}` }}
                  style={styles.attachmentImage as any}
                />
              ) : item.attachment.file_type?.startsWith('audio') ? (
                <TouchableOpacity onPress={() => item.attachment?.storage_path && onPlayAudio(item.attachment.storage_path)} style={styles.voiceNoteBtn}>
                  <Text style={styles.voiceNoteText}>▶ Voice Note</Text>
                </TouchableOpacity>
              ) : (
                <Text style={styles.attachmentFile}>📎 {item.attachment.file_name || 'Attachment'}</Text>
              )}
            </View>
          )}
          <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>{item.content}</Text>
          <View style={styles.bubbleFooter}>
            {item.is_edited && <Text style={styles.editedTag}>edited</Text>}
            <Text style={styles.bubbleTime}>
              {item._optimistic ? 'Sending…' : new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {renderTicks(item as any)}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
});

export default function ChatScreen({ navigation, route }: Props) {
  const { conversationId, conversation } = route.params || {};
  if (!conversationId) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#fff' }}>No conversation selected.</Text>
      </View>
    );
  }
  const { user } = useAuth();
  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [typingUser, setTypingUser] = useState<string | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const flatRef = useRef<FlatList>(null);
  const initialLoadDoneRef = useRef(false);
  const [audioPlayer, setAudioPlayer] = useState<Audio.Sound | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  /**
   * replyToRef — always holds the current replyTo value.
   * React 18 concurrent mode can cause async functions like sendMessage to
   * capture a STALE closure over replyTo (e.g. reading null even after the
   * user swiped to set a reply). The ref is mutation-safe and always current.
   */
  const replyToRef = useRef<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [actionSheetMessage, setActionSheetMessage] = useState<Message | null>(null);

  // Keep replyToRef in sync with replyTo state so async callbacks always
  // read the latest value regardless of when React schedules their render.
  useEffect(() => {
    replyToRef.current = replyTo;
  }, [replyTo]);

  // Inverted FlatList auto-scrolls to latest message (offset 0) natively.
  // No manual keyboard listener needed — KeyboardAvoidingView handles layout.

  // Safe member access — conversation.members may be partial (no profile) when coming from createConversation
  const members = conversation?.members ?? [];
  const otherMember = members.find(m => m.user_id !== user?.id);
  const profile = otherMember?.profile;
  const [isOtherOnline, setIsOtherOnline] = useState(profile?.is_online || false);
  const recipientName = profile?.full_name?.trim() || profile?.username?.trim() || 'Chat';

  const fetchMessages = useCallback(async () => {
    try {
      // Load from cache first (only on first load)
      if (!initialLoadDoneRef.current) {
        const cacheKey = `cache_messages_${conversationId}`;
        const cached = await AsyncStorage.getItem(cacheKey);
        if (cached) {
          setMessages(JSON.parse(cached));
          setLoading(false);
        }
      }

      const res = await apiClient.get(`/chat/conversations/${conversationId}/messages`);
      const data = Array.isArray(res.data) ? res.data : [];
      const newestFirst = [...data].reverse();

      setMessages(newestFirst);
      initialLoadDoneRef.current = true;
      // Save to cache
      await AsyncStorage.setItem(`cache_messages_${conversationId}`, JSON.stringify(newestFirst));

      // Mark conversation as delivered and read in one go
      apiClient.put(`/chat/conversations/${conversationId}/deliver`).catch(() => {});
      apiClient.put(`/chat/conversations/${conversationId}/read`).catch(() => {});
    } catch (e) {
      console.error('[ChatScreen] Failed to load messages:', e);
    } finally {
      setLoading(false);
    }
  // IMPORTANT: Do NOT include messages.length — it causes socket reconnect loop
  }, [conversationId, user?.id]);

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
          
          // Process outbox when connected
          AsyncStorage.getItem(`chat_outbox_${conversationId}`).then(async (outboxJson) => {
            if (!outboxJson) return;
            const currentOutbox = JSON.parse(outboxJson);
            if (currentOutbox.length === 0) return;
            
            const remainingOutbox = [];
            for (const msg of currentOutbox) {
                try {
                    const res = await apiClient.post(`/chat/conversations/${conversationId}/messages`, {
                        content: msg.content,
                        attachmentId: msg.attachmentId,
                        replyToId: msg.replyToId
                    });
                    setMessages(prev => prev.map(m => m.id === msg.id ? { ...res.data } : m));
                } catch (e) {
                    remainingOutbox.push(msg);
                }
            }
            if (remainingOutbox.length < currentOutbox.length) {
                console.log('[ChatScreen] Outbox processed successfully');
            }
            await AsyncStorage.setItem(`chat_outbox_${conversationId}`, JSON.stringify(remainingOutbox));
          });
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
          const currentUser = userRef.current;
          setMessages(prev => {
            if (prev.some(m => m.id === msg.id)) return prev;

            // If we are the sender, and we have an optimistic message, replace it.
            // IMPORTANT: preserve the local reply_to object if the broadcast
            // payload doesn't carry the fully-resolved nested object yet
            // (e.g. RPC path before migration 199 is applied).
            if (msg.sender_id === currentUser?.id) {
              const optIndex = prev.findIndex(m =>
                m._optimistic && (m.content === msg.content || m.type === msg.type)
              );
              if (optIndex !== -1) {
                const next = [...prev];
                const existingReplyTo = prev[optIndex].reply_to;
                next[optIndex] = {
                  ...msg,
                  // Keep local reply_to when server broadcast doesn't resolve it
                  reply_to: msg.reply_to ?? existingReplyTo,
                };
                return next;
              }
            }

            // Mark as delivered+read immediately since user is actively in the chat.
            // Optimistically set timestamp locally so sender's tick updates fast.
            if (msg.sender_id !== currentUser?.id) {
              const now = new Date().toISOString();
              // Background HTTP calls to persist in DB + broadcast receipt to sender
              apiClient.put(`/chat/messages/${msg.id}/deliver`).catch(() => {});
              apiClient.put(`/chat/messages/${msg.id}/read`).catch(() => {});
              return [{ ...msg, delivered_at: now, read_at: now } as any, ...prev];
            }
            return [msg, ...prev];
          });
        });

        socket.on('chat:message_edited', (editedMsg: Message) => {
          setMessages(prev => prev.map(m => m.id === editedMsg.id ? { ...m, ...editedMsg } : m));
        });

        socket.on('chat:message_deleted', ({ messageId }: { messageId: string }) => {
          setMessages(prev => prev.filter(m => m.id !== messageId));
        });

        // Message status updates — use server-provided timestamps for accuracy
        socket.on('chat:message_read', ({ messageId, readAt }: { messageId: string; readAt?: string }) => {
          setMessages(prev => prev.map(m =>
            m.id === messageId ? { ...m, read_at: readAt || new Date().toISOString() } as any : m
          ));
        });

        socket.on('chat:message_delivered', ({ messageId, delivered_at }: { messageId: string; delivered_at?: string }) => {
          setMessages(prev => prev.map(m =>
            m.id === messageId ? { ...m, delivered_at: delivered_at || new Date().toISOString() } as any : m
          ));
        });

        // Conversation-wide status updates
        socket.on('chat:conversation_read', ({ conversationId: readConvId, readerId, readAt }: { conversationId: string, readerId: string, readAt: string }) => {
          const currentUser = userRef.current;
          if (readConvId === conversationId && readerId !== currentUser?.id) {
            setMessages(prev => prev.map(m =>
              m.sender_id === currentUser?.id ? { ...m, read_at: readAt, delivered_at: readAt } as any : m
            ));
          }
        });

        socket.on('chat:conversation_delivered', ({ conversationId: delConvId, userId: delUserId, delivered_at }: { conversationId: string, userId: string, delivered_at: string }) => {
          const currentUser = userRef.current;
          if (delConvId === conversationId && delUserId !== currentUser?.id) {
            setMessages(prev => prev.map(m =>
              m.sender_id === currentUser?.id && !(m as any).read_at ? { ...m, delivered_at: delivered_at } as any : m
            ));
          }
        });

        // Typing indicator
        socket.on('chat:typing', ({ userId: typingId, username, isTyping }: { userId: string; username?: string; isTyping: boolean }) => {
          const currentUser = userRef.current;
          if (typingId === currentUser?.id) return;
          if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
          if (isTyping) {
            setTypingUser(username || recipientName);
            typingTimerRef.current = setTimeout(() => setTypingUser(null), 4000);
          } else {
            setTypingUser(null);
          }
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
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [conversationId, otherMember?.user_id]);

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

    // ── Snapshot reply state NOW, before any await or state mutation ──
    // This is the WhatsApp-grade fix: replyToRef.current is always the latest
    // value even if React's concurrent scheduler deferred the render that
    // would have updated the closure. We freeze it as replySnapshot so the
    // entire send lifecycle (optimistic insert → API call → server replace)
    // uses the exact same reply context.
    const replySnapshot = replyToRef.current;

    if (!overrideContent) setText('');
    setSending(true);

    // Build optimistic message with frozen reply snapshot
    const optimisticId = `opt-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      content: contentToSend,
      sender_id: user?.id ?? '',
      created_at: new Date().toISOString(),
      _optimistic: true,
      reply_to: replySnapshot
        ? {
            id: replySnapshot.id,
            content: replySnapshot.content,
            sender_id: replySnapshot.sender_id,
            sender_name: replySnapshot.sender
              ? (replySnapshot.sender.full_name || replySnapshot.sender.username)
              : undefined,
            message_type: replySnapshot.type,
          }
        : undefined,
    };
    // Insert optimistic immediately so the user sees the bubble with reply context
    setMessages(prev => [optimisticMsg, ...prev]);

    try {
      if (editingMessage) {
        await apiClient.patch(`/chat/messages/${editingMessage.id}`, { content: contentToSend });
        setEditingMessage(null);
        // Remove the erroneous optimistic that was added for the edit path
        setMessages(prev => prev.filter(m => m.id !== optimisticId));
      } else {
        const res = await apiClient.post(
          `/chat/conversations/${conversationId}/messages`,
          {
            content: contentToSend,
            attachmentId,
            // Send the frozen snapshot ID — guarantees replyToId is set even if
            // replyTo state was cleared by a concurrent render before this await
            replyToId: replySnapshot?.id,
          }
        );

        const serverMsg: Message = res.data;
        if (serverMsg?.id) {
          setMessages(prev => {
            // Try to find the optimistic by its temp ID first
            const optimisticInPrev = prev.find(m => m.id === optimisticId);

            if (optimisticInPrev) {
              // Normal path: replace optimistic with server message
              return prev.map(m =>
                m.id === optimisticId
                  ? {
                      ...serverMsg,
                      // Prefer server's resolved reply_to; fall back to frozen snapshot
                      reply_to: serverMsg.reply_to ?? optimisticMsg.reply_to,
                    }
                  : m
              );
            }

            // WebSocket beat the HTTP response: optimistic was already replaced
            // by chat:message event (its ID changed to the real server ID).
            // Check if the server message is already present.
            if (prev.some(m => m.id === serverMsg.id)) {
              // Already in list — ensure reply_to is preserved
              return prev.map(m =>
                m.id === serverMsg.id
                  ? { ...m, reply_to: m.reply_to ?? serverMsg.reply_to ?? optimisticMsg.reply_to }
                  : m
              );
            }

            // Fallback: just prepend the confirmed server message
            return [{ ...serverMsg, reply_to: serverMsg.reply_to ?? optimisticMsg.reply_to }, ...prev];
          });
        }

        // Clear reply banner ONLY after successful server acknowledgement
        setReplyTo(null);
        replyToRef.current = null;
      }
    } catch (e: any) {
      console.error('[ChatScreen] Send failed:', e);
      setMessages(prev => prev.map(m =>
        m.id === optimisticId ? { ...m, _optimistic: false, type: 'failed' } : m
      ));

      if (!editingMessage) {
        // Persist to outbox with frozen reply snapshot so retry is correct
        const outboxMsg = {
          id: optimisticId,
          content: contentToSend,
          attachmentId,
          replyToId: replySnapshot?.id,
          // Store full reply snapshot so the bubble shows correctly after reconnect
          replyTo: optimisticMsg.reply_to,
        };
        const currentOutbox = JSON.parse(
          await AsyncStorage.getItem(`chat_outbox_${conversationId}`) || '[]'
        );
        await AsyncStorage.setItem(
          `chat_outbox_${conversationId}`,
          JSON.stringify([...currentOutbox, outboxMsg])
        );
        // Clear banner — reply is safely queued in the outbox
        setReplyTo(null);
        replyToRef.current = null;
      }

      if (!overrideContent) setText(contentToSend);
      Alert.alert('Send Failed', 'Could not send your message. It will retry when reconnected.');
    } finally {
      setSending(false);
    }
  };


  const handlePickMedia = async () => {
    try {
      const asset = await MediaService.pickImage();
      if (!asset) return;

      setSending(true);
      const attachment = await MediaService.uploadMedia(
        asset.uri,
        asset.fileName || `upload_${Date.now()}.jpg`,
        asset.mimeType || 'image/jpeg',
        conversationId
      );

      // Determine the human-readable content label
      const contentLabel = (asset.mimeType || '').startsWith('video') ? '📹 Video' : '🖼️ Image';
      await sendMessage(contentLabel, attachment.id);
    } catch (err: any) {
      console.error('[ChatScreen] Media upload error:', err);
      Alert.alert('Upload Error', err.message || 'Failed to upload media. Please try again.');
    } finally {
      setSending(false);
    }
  };

  const handleVoiceNote = async () => {
    if (isRecording) {
      // Stop recording
      setIsRecording(false);
      try {
        setSending(true);
        const attachment = await VoiceService.stopRecording(conversationId);
        if (attachment) {
          await sendMessage('🎤 Voice Note', attachment.id);
        } else {
          Alert.alert('Voice Note Error', 'Recording was empty. Please try again.');
        }
      } catch (err: any) {
        console.error('[ChatScreen] Voice note stop error:', err);
        Alert.alert('Voice Note Error', err.message || 'Failed to process voice note.');
      } finally {
        setSending(false);
      }
    } else {
      // Start recording
      try {
        await VoiceService.startRecording();
        setIsRecording(true);
      } catch (err: any) {
        console.error('[ChatScreen] Voice note start error:', err);
        setIsRecording(false);
        Alert.alert('Recording Error', err.message || 'Could not start recording. Check microphone permission.');
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

  // Open the action sheet — reliable on both iOS and Android
  const handleLongPress = useCallback((msg: Message) => {
    setActionSheetMessage(msg);
  }, []);

  const handleCopy = useCallback((msg: Message) => {
    try {
      // Use the Share API as a reliable copy fallback across all Expo versions
      Share.share({ message: msg.content }).catch(() => {});
    } catch (_) {}
    Alert.alert('Copied ✓', 'Message text copied.');
  }, []);

  const handleShare = useCallback(async (msg: Message) => {
    try { await Share.share({ message: msg.content }); } catch (_) {}
  }, []);

  const handleEditMsg = useCallback((msg: Message) => {
    setEditingMessage(msg);
    setText(msg.content);
  }, []);

  const handleDeleteMsg = useCallback((msg: Message) => {
    Alert.alert('Delete Message', 'This message will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMessage(msg.id) },
    ]);
  }, [deleteMessage]);

  const renderMessage = useCallback(({ item }: { item: Message }) => (
    <ChatMessageBubble
      item={item}
      currentUserId={user?.id ?? ''}
      recipientName={recipientName}
      onLongPress={handleLongPress}
      onSwipeRight={(msg) => setReplyTo(msg)}
      onPlayAudio={playVoiceNote}
    />
  ), [user?.id, recipientName, handleLongPress, playVoiceNote]);

  // ── Initiate VoIP call via SignalingService (no carrier/GSM) ──────────────
  const startCall = useCallback(async (callType: 'audio' | 'video') => {
    if (!otherMember?.user_id) return;
    try {
      await SignalingService.startCall(
        otherMember.user_id,
        recipientName,
        callType,
        conversationId
      );
      navigation.navigate('Call', {
        type: callType,
        conversationId,
        targetUserId: otherMember.user_id,
        targetName: recipientName,
        isIncoming: false,
      });
    } catch (err) {
      console.error('[ChatScreen] Call start error:', err);
      Alert.alert('Call Failed', 'Could not start call. Please check your connection.');
    }
  }, [otherMember?.user_id, recipientName, conversationId, navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
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

        {/* VoIP Call Buttons — in-app only, no GSM */}
        <View style={styles.headerActions}>
          <TouchableOpacity
            onPress={() => startCall('audio')}
            style={styles.headerActionBtn}
          >
            <Text style={styles.headerActionIcon}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => startCall('video')}
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
        <>
        {typingUser && (
          <View style={styles.typingRow}>
            <Text style={styles.typingText}>{typingUser} is typing</Text>
            <Text style={styles.typingDots}>•••</Text>
          </View>
        )}
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={i => i?.id || i?._optimistic ? `opt-${Math.random()}` : Math.random().toString()}
          renderItem={renderMessage}
          inverted
          keyboardDismissMode="interactive"
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          removeClippedSubviews={true}
          maxToRenderPerBatch={10}
          windowSize={11}
          initialNumToRender={15}
          updateCellsBatchingPeriod={50}
          contentContainerStyle={styles.msgList}
          ListEmptyComponent={
            <View style={styles.emptyChat}>
              <Text style={styles.emptyChatText}>No messages yet. Say hello! 👋</Text>
            </View>
          }
        />
        </>
      )}

      {/* Message Action Sheet — long press menu */}
      {actionSheetMessage && (
        <MessageActionSheet
          message={actionSheetMessage}
          currentUserId={user?.id ?? ''}
          onClose={() => setActionSheetMessage(null)}
          onReply={(msg) => setReplyTo(msg)}
          onCopy={handleCopy}
          onShare={handleShare}
          onEdit={handleEditMsg}
          onDelete={handleDeleteMsg}
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
            <Text style={styles.actionTitle}>↩ Replying to {replyTo.sender_id === user?.id ? 'yourself' : recipientName}</Text>
            <Text style={styles.actionText} numberOfLines={1}>{replyTo.content}</Text>
          </View>
          <TouchableOpacity onPress={() => setReplyTo(null)} style={styles.actionClose}>
            <Text style={styles.actionCloseText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Input */}
      <View style={[styles.inputContainer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={styles.inputRow}>
          <TouchableOpacity style={styles.attachBtn} onPress={handlePickMedia}>
            <Text style={styles.attachIcon}>📎</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            placeholderTextColor="#444"
            value={text}
            onChangeText={(t) => {
              setText(t);
              if (socketRef.current?.connected) {
                socketRef.current.emit('typing', { conversationId });
              }
            }}
            multiline
            maxLength={2000}
            returnKeyType="default"
            textAlignVertical="center"
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
  bubbleText: { color: '#fff', fontSize: 16, lineHeight: 22 },
  bubbleFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 4 },
  editedTag: { color: 'rgba(255,255,255,0.4)', fontSize: 10, fontStyle: 'italic', marginRight: 4 },
  bubbleTime: { color: 'rgba(255,255,255,0.4)', fontSize: 10 },
  replyContext: {
    flexDirection: 'row',
    backgroundColor: 'rgba(99,102,241,0.08)',
    borderRadius: 6,
    marginBottom: 6,
    overflow: 'hidden',
  },
  replyContextBar: {
    width: 3,
    backgroundColor: '#6366f1',
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
    flexShrink: 0,
  },
  replyContextBody: {
    flex: 1,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  replyContextName: { color: '#818cf8', fontSize: 11, fontWeight: '700', marginBottom: 2 },
  replyContextText: { color: 'rgba(255,255,255,0.55)', fontSize: 12, lineHeight: 16 },
  actionPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d0d1e',
    padding: 12,
    borderTopWidth: 1,
    borderColor: '#111133',
  },
  inputContainer: { backgroundColor: '#0d0d1e', borderTopWidth: 1, borderColor: '#111133' },
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
  typingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 6, backgroundColor: '#060611' },
  typingText: { color: '#6366f1', fontSize: 12, fontStyle: 'italic' },
  typingDots: { color: '#6366f1', fontSize: 14, marginLeft: 4, letterSpacing: 2 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
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
  // Swipe-to-reply indicator
  replyIndicator: {
    position: 'absolute',
    top: '50%',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#6366f122',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 0,
  },
  replyIndicatorLeft: { left: 36 },
  replyIndicatorRight: { right: 4 },
  replyIndicatorIcon: { fontSize: 16, color: '#6366f1' },
});

// ── Action Sheet Styles ────────────────────────────────────────────────
const asStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0d0d1e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: 32,
    paddingTop: 12,
    borderWidth: 1,
    borderColor: '#1e1e3a',
    borderBottomWidth: 0,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: '#333', alignSelf: 'center', marginBottom: 16,
  },
  preview: {
    marginHorizontal: 20,
    marginBottom: 16,
    padding: 14,
    backgroundColor: '#060611',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#1e1e3a',
  },
  previewLabel: { color: '#6366f1', fontSize: 11, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.8 },
  previewText: { color: '#ccc', fontSize: 14, lineHeight: 20 },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 8,
    marginBottom: 12,
  },
  actionBtn: {
    flexBasis: '22%',
    flexGrow: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    backgroundColor: '#111133',
  },
  actionIconWrap: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center', marginBottom: 6,
  },
  actionIcon: { fontSize: 20 },
  actionLabel: { color: '#ccc', fontSize: 12, fontWeight: '600' },
  cancelBtn: {
    marginHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#111133',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#1e1e3a',
  },
  cancelText: { color: '#888', fontSize: 15, fontWeight: '600' },
});
