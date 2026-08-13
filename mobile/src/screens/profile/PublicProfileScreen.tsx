import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, Image, FlatList
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import apiClient from '../../api/apiClient';
import { useAuth } from '../../context/AuthContext';

export default function PublicProfileScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { userId } = route.params || {};
  const { user: currentUser } = useAuth();

  const [profile, setProfile] = useState<any>(null);
  const [publishedNotes, setPublishedNotes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfileData() {
      if (!userId) return;
      setLoading(true);
      try {
        const [profRes, notesRes] = await Promise.allSettled([
          apiClient.get(`/users/profile/${userId}`),
          apiClient.get(`/notes/public?user_id=${userId}`)
        ]);

        if (profRes.status === 'fulfilled') {
          setProfile(profRes.value.data);
        }
        if (notesRes.status === 'fulfilled') {
          setPublishedNotes(notesRes.value.data || []);
        }
      } catch (e) {
        console.warn('[PublicProfileScreen] Failed to load profile:', e);
      } finally {
        setLoading(false);
      }
    }
    loadProfileData();
  }, [userId]);

  const handleStartChat = async () => {
    try {
      const res = await apiClient.post('/chat/conversations', { recipient_id: userId });
      const conv = res.data;
      if (conv) {
        navigation.navigate('Chat', { conversationId: conv.id, conversation: conv });
      }
    } catch (e: any) {
      console.warn('Failed to start chat:', e);
    }
  };

  if (loading) {
    return (
      <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </LinearGradient>
    );
  }

  const name = profile?.full_name || profile?.username || 'User Profile';
  const avatarUrl = profile?.avatar_url;

  return (
    <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>User Profile</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Profile Card */}
        <View style={styles.profileCard}>
          <View style={styles.avatarLarge}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
            ) : (
              <Text style={styles.avatarTextLarge}>{name.charAt(0).toUpperCase()}</Text>
            )}
          </View>

          <Text style={styles.userName}>{name}</Text>
          <Text style={styles.userHandle}>@{profile?.username || 'member'}</Text>
          {profile?.bio && <Text style={styles.userBio}>{profile.bio}</Text>}

          {currentUser?.id !== userId && (
            <TouchableOpacity style={styles.messageBtn} onPress={handleStartChat}>
              <Text style={styles.messageBtnText}>💬 Send Direct Message</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Public Notes Section */}
        <Text style={styles.sectionTitle}>Published Notes ({publishedNotes.length})</Text>
        {publishedNotes.length === 0 ? (
          <Text style={styles.emptyText}>No public notes published yet.</Text>
        ) : (
          publishedNotes.map(n => (
            <View key={n.id} style={styles.noteCard}>
              <Text style={styles.noteTitle}>{n.title || 'Untitled Note'}</Text>
              <Text style={styles.noteSnippet} numberOfLines={2}>{n.content}</Text>
              <Text style={styles.noteDate}>{new Date(n.created_at).toLocaleDateString()}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1e1e3a'
  },
  backBtn: { padding: 4 },
  backText: { color: '#6366f1', fontSize: 16, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  content: { padding: 20 },
  profileCard: {
    backgroundColor: '#111122', borderRadius: 24, padding: 24, alignItems: 'center',
    borderWidth: 1, borderColor: '#222244', marginBottom: 28
  },
  avatarLarge: {
    width: 84, height: 84, borderRadius: 42, backgroundColor: '#6366f1',
    justifyContent: 'center', alignItems: 'center', marginBottom: 14, overflow: 'hidden'
  },
  avatarImg: { width: '100%', height: '100%' },
  avatarTextLarge: { color: '#fff', fontSize: 36, fontWeight: '800' },
  userName: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 4 },
  userHandle: { color: '#818cf8', fontSize: 14, fontWeight: '600', marginBottom: 12 },
  userBio: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 18, marginBottom: 18 },
  messageBtn: { backgroundColor: '#6366f1', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 14 },
  messageBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  sectionTitle: { color: '#aaa', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 14, letterSpacing: 1 },
  noteCard: {
    backgroundColor: '#111122', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#222244'
  },
  noteTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  noteSnippet: { color: '#888', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  noteDate: { color: '#555', fontSize: 11 },
  emptyText: { color: '#666', fontSize: 13, textAlign: 'center', marginTop: 10 }
});
