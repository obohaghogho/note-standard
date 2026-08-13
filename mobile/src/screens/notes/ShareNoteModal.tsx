import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, FlatList
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../api/supabase';
import apiClient from '../../api/apiClient';

export default function ShareNoteModal() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { noteId, noteTitle } = route.params || {};

  const [query, setQuery] = useState('');
  const [users, setUsers] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [selectedAccess, setSelectedAccess] = useState<'view' | 'edit'>('view');

  const searchUsers = async (text: string) => {
    setQuery(text);
    if (!text || text.length < 2) {
      setUsers([]);
      return;
    }
    setSearching(true);
    try {
      const res = await apiClient.get(`/chat/friends?search=${encodeURIComponent(text)}`);
      setUsers(res.data || []);
    } catch (e) {
      setUsers([]);
    } finally {
      setSearching(false);
    }
  };

  const handleShareWithUser = async (targetUser: any) => {
    if (!noteId) {
      Alert.alert('Error', 'Invalid Note ID');
      return;
    }

    setSharing(true);
    try {
      const { error } = await supabase
        .from('note_shares')
        .insert({
          note_id: noteId,
          shared_with_user_id: targetUser.id || targetUser.user_id,
          permission: selectedAccess,
        });

      if (error) {
        // Fallback to API if supabase table requires API route
        await apiClient.post('/notes/share', {
          note_id: noteId,
          target_user_id: targetUser.id || targetUser.user_id,
          permission: selectedAccess
        });
      }

      Alert.alert(
        '✅ Note Shared',
        `Successfully shared "${noteTitle || 'Note'}" with ${targetUser.full_name || targetUser.username || 'user'}.`
      );
      navigation.goBack();
    } catch (err: any) {
      Alert.alert('Sharing Failed', err.response?.data?.error || err.message || 'Could not share note.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Share Note</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.noteTitleDisplay}>Sharing: "{noteTitle || 'Untitled Note'}"</Text>

        {/* Permission Toggle */}
        <Text style={styles.label}>Access Permission</Text>
        <View style={styles.permRow}>
          <TouchableOpacity
            style={[styles.permChip, selectedAccess === 'view' && styles.permChipActive]}
            onPress={() => setSelectedAccess('view')}
          >
            <Text style={[styles.permText, selectedAccess === 'view' && styles.permTextActive]}>Can View</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.permChip, selectedAccess === 'edit' && styles.permChipActive]}
            onPress={() => setSelectedAccess('edit')}
          >
            <Text style={[styles.permText, selectedAccess === 'edit' && styles.permTextActive]}>Can Edit</Text>
          </TouchableOpacity>
        </View>

        {/* Search User Input */}
        <Text style={styles.label}>Search User by @username or Name</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="Search recipient..."
          placeholderTextColor="#555577"
          value={query}
          onChangeText={searchUsers}
          autoCapitalize="none"
        />

        {searching ? (
          <ActivityIndicator size="small" color="#6366f1" style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={users}
            keyExtractor={item => item.id || item.user_id || Math.random().toString()}
            style={{ marginTop: 12 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.userCard}
                onPress={() => handleShareWithUser(item)}
                disabled={sharing}
              >
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {(item.full_name || item.username || 'U').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.userName}>{item.full_name || item.username}</Text>
                  <Text style={styles.userSub}>@{item.username || 'user'}</Text>
                </View>
                <Text style={styles.shareActionText}>Share →</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              query.length > 1 ? (
                <Text style={styles.emptyText}>No matching users found.</Text>
              ) : (
                <Text style={styles.emptyText}>Type a username above to search for people.</Text>
              )
            }
          />
        )}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 50, paddingBottom: 16,
    borderBottomWidth: 1, borderBottomColor: '#1e1e3a'
  },
  closeBtn: { padding: 8 },
  closeText: { color: '#888', fontSize: 20, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  content: { padding: 20, flex: 1 },
  noteTitleDisplay: { color: '#818cf8', fontSize: 15, fontWeight: '700', marginBottom: 20 },
  label: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  permRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  permChip: {
    flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#111122',
    borderWidth: 1, borderColor: '#222244', alignItems: 'center'
  },
  permChipActive: { backgroundColor: '#6366f1', borderColor: '#818cf8' },
  permText: { color: '#888', fontSize: 14, fontWeight: '700' },
  permTextActive: { color: '#fff' },
  searchInput: {
    backgroundColor: '#111122', color: '#fff', borderRadius: 12, borderWidth: 1,
    borderColor: '#222244', paddingHorizontal: 16, paddingVertical: 14, fontSize: 15
  },
  userCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#111122',
    borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#222244'
  },
  avatarCircle: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: '#6366f1',
    justifyContent: 'center', alignItems: 'center', marginRight: 12
  },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  userName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  userSub: { color: '#888', fontSize: 12 },
  shareActionText: { color: '#6366f1', fontSize: 14, fontWeight: '800' },
  emptyText: { color: '#666', fontSize: 13, textAlign: 'center', marginTop: 30 }
});
