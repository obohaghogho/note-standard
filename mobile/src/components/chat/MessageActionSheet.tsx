import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { Message } from './ChatMessageBubble';

interface Props {
  message: Message | null;
  currentUserId: string;
  onClose: () => void;
  onReply: (m: Message) => void;
  onCopy: (m: Message) => void;
  onShare: (m: Message) => void;
  onEdit: (m: Message) => void;
  onDelete: (m: Message) => void;
}

export const MessageActionSheet = React.memo(({
  message, currentUserId, onClose, onReply, onCopy, onShare, onEdit, onDelete,
}: Props) => {
  const isMe = message?.sender_id === currentUserId;
  if (!message) return null;
  const actions = [
    { icon: '↩', label: 'Reply', color: '#6366f1', onPress: () => { onReply(message); onClose(); } },
    { icon: '📋', label: 'Copy', color: '#10b981', onPress: () => { onCopy(message); onClose(); } },
    { icon: '↗', label: 'Share', color: '#3b82f6', onPress: () => { onShare(message); onClose(); } },
    ...(isMe && !message._optimistic && message.status !== 'sending' ? [
      { icon: '✏', label: 'Edit', color: '#f59e0b', onPress: () => { onEdit(message); onClose(); } },
      { icon: '🗑', label: 'Delete', color: '#ef4444', danger: true, onPress: () => { onDelete(message); onClose(); } },
    ] : []),
  ];
  return (
    <Modal transparent animationType="slide" visible statusBarTranslucent onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} onPress={onClose} activeOpacity={1}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.preview}>
            <Text style={styles.previewLabel}>{isMe ? 'Your message' : 'Message'}</Text>
            <Text style={styles.previewText} numberOfLines={2}>{message.content || '📎 Attachment'}</Text>
          </View>
          <View style={styles.grid}>
            {actions.map((a, i) => (
              <TouchableOpacity key={i} style={styles.actionBtn} onPress={a.onPress} activeOpacity={0.7}>
                <View style={[styles.actionIconWrap, { backgroundColor: a.color + '22' }]}>
                  <Text style={styles.actionIcon}>{a.icon}</Text>
                </View>
                <Text style={[styles.actionLabel, (a as any).danger && { color: '#ef4444' }]}>{a.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
});

const styles = StyleSheet.create({
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
