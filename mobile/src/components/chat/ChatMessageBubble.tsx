import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Image, StyleSheet, Animated, PanResponder } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

export interface Message {
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
  reply_to_id?: string;
  reply_to?: {
    id: string;
    content: string;
    sender_id: string;
    sender_name?: string;
    message_type?: string;
    type?: string;
    deleted?: boolean;
  };
  status?: string;
  read_at?: string;
  delivered_at?: string;
}

interface Props {
  item: Message;
  currentUserId: string;
  recipientName: string;
  onLongPress: (msg: Message) => void;
  onSwipeRight?: (msg: Message) => void;
  onPlayAudio: (path: string) => void;
}

export const ChatMessageBubble = React.memo(({
  item, currentUserId, recipientName, onLongPress, onSwipeRight, onPlayAudio,
}: Props) => {
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

  const renderTicks = () => {
    if (!isMe) return null;
    if (item._optimistic || item.status === 'sending') return <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{'  ✓'}</Text>;
    if (item.read_at || item.status === 'read') return <Text style={{ color: '#60a5fa', fontSize: 10 }}>{'  ✓✓'}</Text>;
    if (item.delivered_at || item.status === 'delivered') return <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 10 }}>{'  ✓✓'}</Text>;
    return <Text style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10 }}>{'  ✓'}</Text>;
  };

  return (
    <View style={[styles.msgRow, isMe && styles.msgRowMe]} {...panResponder.panHandlers}>
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
            (item._optimistic || item.status === 'sending') && styles.bubbleOptimistic,
          ]}
        >
          {item.reply_to && (
            <View style={styles.replyContext}>
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
                    : (item.reply_to.message_type || item.reply_to.type) === 'image'   ? '📷 Photo'
                    : (item.reply_to.message_type || item.reply_to.type) === 'video'   ? '🎥 Video'
                    : (item.reply_to.message_type || item.reply_to.type) === 'audio'   ? '🎤 Voice note'
                    : (item.reply_to.message_type || item.reply_to.type) === 'document' ? '📄 Document'
                    : item.reply_to.content || 'Message'}
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
              {item._optimistic || item.status === 'sending' ? 'Sending…' : new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {renderTicks()}
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}, (prev, next) => {
  return (
    prev.item.id === next.item.id &&
    prev.item.content === next.item.content &&
    prev.item.status === next.item.status &&
    prev.item.read_at === next.item.read_at &&
    prev.item.delivered_at === next.item.delivered_at &&
    prev.item.is_edited === next.item.is_edited &&
    prev.item._optimistic === next.item._optimistic &&
    prev.currentUserId === next.currentUserId
  );
});

const styles = StyleSheet.create({
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
  attachmentContainer: { marginBottom: 8, borderRadius: 8, overflow: 'hidden' },
  attachmentImage: { width: 200, height: 150, borderRadius: 8, backgroundColor: '#222' },
  voiceNoteBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', padding: 8, borderRadius: 8 },
  voiceNoteText: { color: '#fff', fontSize: 14 },
  attachmentFile: { color: '#6366f1', fontSize: 14, textDecorationLine: 'underline' },
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
