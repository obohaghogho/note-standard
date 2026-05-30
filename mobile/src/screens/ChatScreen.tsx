import React, { useCallback, useRef, useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, FlatList,
  StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Image,
  Alert, Share,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp, useIsFocused } from '@react-navigation/native';
import { ChatStackParamList } from '../navigation/ChatStack';
import { Audio } from 'expo-av';
import SignalingService from '../services/SignalingService';
import apiClient from '../api/apiClient';

import { MessageComposer } from '../components/chat/MessageComposer';
import { ChatMessageBubble, Message } from '../components/chat/ChatMessageBubble';
import { MessageActionSheet } from '../components/chat/MessageActionSheet';

type Props = {
  navigation: NativeStackNavigationProp<ChatStackParamList, 'Chat'>;
  route: RouteProp<ChatStackParamList, 'Chat'>;
};

export default function ChatScreen({ navigation, route }: Props) {
  const { conversationId, conversation } = route.params || {};
  const { user } = useAuth();
  const { messages: allMessages, sendMessage, editMessage, deleteMessage, setActiveConversationId, onMessageVisible } = useChat();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  
  const [audioPlayer, setAudioPlayer] = useState<Audio.Sound | null>(null);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [actionSheetMessage, setActionSheetMessage] = useState<Message | null>(null);
  
  const flatRef = useRef<FlatList>(null);
  const messages = allMessages[conversationId] || [];

  const members = conversation?.members ?? [];
  const otherMember = members.find(m => m.user_id !== user?.id);
  const profile = otherMember?.profile;
  const isOtherOnline = profile?.is_online || false;
  const recipientName = profile?.full_name?.trim() || profile?.username?.trim() || 'Chat';

  useEffect(() => {
    if (isFocused) {
      setActiveConversationId(conversationId);
    } else {
      setActiveConversationId(null);
    }
  }, [isFocused, conversationId, setActiveConversationId]);

  const handleSend = useCallback(async (content: string, attachmentId?: string) => {
    if (editingMessage) {
      await editMessage(conversationId, editingMessage.id, content);
      setEditingMessage(null);
    } else {
      await sendMessage(conversationId, content, attachmentId, replyTo?.id);
      setReplyTo(null);
    }
  }, [editingMessage, conversationId, replyTo, editMessage, sendMessage]);

  const handleDeleteMsg = useCallback(async (msg: Message) => {
    Alert.alert('Delete Message', 'This message will be permanently deleted.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteMessage(conversationId, msg.id) },
    ]);
  }, [conversationId, deleteMessage]);

  const playVoiceNote = useCallback(async (path: string) => {
    try {
      if (audioPlayer) await audioPlayer.unloadAsync();
      const res = await apiClient.get(`/media/signed-url?path=${path}`);
      const { sound } = await Audio.Sound.createAsync({ uri: res.data.url });
      setAudioPlayer(sound);
      await sound.playAsync();
    } catch (err) {
      console.error('Failed to play audio', err);
    }
  }, [audioPlayer]);

  const handleCopy = useCallback((msg: Message) => {
    try { Share.share({ message: msg.content }).catch(() => {}); } catch (_) {}
    Alert.alert('Copied ✓', 'Message text copied.');
  }, []);

  const handleShare = useCallback(async (msg: Message) => {
    try { await Share.share({ message: msg.content }); } catch (_) {}
  }, []);

  const renderMessage = useCallback(({ item }: { item: Message }) => {
    // Notify context that message is visible to trigger read receipt
    if (!item.isOwn && item.status !== 'read' && !item.read_at) {
        onMessageVisible(conversationId, item.id);
    }
    return (
      <ChatMessageBubble
        item={item}
        currentUserId={user?.id ?? ''}
        recipientName={recipientName}
        onLongPress={setActionSheetMessage}
        onSwipeRight={setReplyTo}
        onPlayAudio={playVoiceNote}
      />
    );
  }, [user?.id, recipientName, playVoiceNote, onMessageVisible, conversationId]);

  const startCall = useCallback(async (callType: 'audio' | 'video') => {
    if (!otherMember?.user_id) return;
    try {
      await SignalingService.startCall(otherMember.user_id, recipientName, callType, conversationId);
      navigation.navigate('Call', {
        type: callType,
        conversationId,
        targetUserId: otherMember.user_id,
        targetName: recipientName,
        isIncoming: false,
      });
    } catch (err) {
      Alert.alert('Call Failed', 'Could not start call. Please check your connection.');
    }
  }, [otherMember?.user_id, recipientName, conversationId, navigation]);

  if (!conversationId) {
    return <View style={styles.center}><Text style={{ color: '#fff' }}>No conversation selected.</Text></View>;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
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

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={() => startCall('audio')} style={styles.headerActionBtn}>
            <Text style={styles.headerActionIcon}>📞</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => startCall('video')} style={styles.headerActionBtn}>
            <Text style={styles.headerActionIcon}>📹</Text>
          </TouchableOpacity>
        </View>
      </View>

      <FlatList
        ref={flatRef}
        data={messages}
        keyExtractor={i => i?.id ? i.id : Math.random().toString()}
        renderItem={renderMessage}
        inverted
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        removeClippedSubviews={false}
        maxToRenderPerBatch={10}
        windowSize={21}
        initialNumToRender={15}
        updateCellsBatchingPeriod={50}
        contentContainerStyle={styles.msgList}
        ListEmptyComponent={
          <View style={styles.emptyChat}>
            <Text style={styles.emptyChatText}>No messages yet. Say hello! 👋</Text>
          </View>
        }
      />

      {actionSheetMessage && (
        <MessageActionSheet
          message={actionSheetMessage}
          currentUserId={user?.id ?? ''}
          onClose={() => setActionSheetMessage(null)}
          onReply={setReplyTo}
          onCopy={handleCopy}
          onShare={handleShare}
          onEdit={setEditingMessage}
          onDelete={handleDeleteMsg}
        />
      )}

      {editingMessage && (
        <View style={styles.actionPreview}>
          <View style={styles.actionInfo}>
            <Text style={styles.actionTitle}>Editing Message</Text>
            <Text style={styles.actionText} numberOfLines={1}>{editingMessage.content}</Text>
          </View>
          <TouchableOpacity onPress={() => setEditingMessage(null)} style={styles.actionClose}>
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

      <MessageComposer
        conversationId={conversationId}
        onSend={handleSend}
        insets={insets}
      />
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
  emptyChat: { alignItems: 'center', paddingTop: 60 },
  emptyChatText: { color: '#444', fontSize: 14 },
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
});
