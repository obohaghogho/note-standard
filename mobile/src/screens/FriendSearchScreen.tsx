import React, { useState } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Image, Alert
} from 'react-native';
import { ChatService } from '../services/ChatService';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import apiClient from '../api/apiClient';

export default function FriendSearchScreen() {
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [startingChat, setStartingChat] = useState<string | null>(null); // track which user's chat is being started

  const handleSearch = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await apiClient.get(`/users/search?q=${encodeURIComponent(query.trim())}`);
      setResults(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      console.error('[Search] Failed:', e);
      Alert.alert('Search Error', e?.response?.data?.error || 'Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const startChat = async (username: string) => {
    setStartingChat(username);
    try {
      // FIX: Use ChatService.createConversation which null-safely normalises the response
      const conversation = await ChatService.createConversation(username);

      if (!conversation) {
        Alert.alert('Error', 'Could not start chat. Please try again.');
        return;
      }

      // Navigate — conversation.members is guaranteed to be an array (even if empty)
      navigation.navigate('Chat', {
        conversationId: conversation.id,
        conversation,
      });
    } catch (e: any) {
      console.error('[StartChat] Error:', e);
      const msg = e?.response?.data?.error || e?.message || 'Failed to start chat';
      Alert.alert('Error', msg);
    } finally {
      setStartingChat(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>✕</Text>
        </TouchableOpacity>
        <TextInput
          style={styles.searchInput}
          placeholder="Search by username..."
          placeholderTextColor="#666"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          autoFocus
          autoCapitalize="none"
          returnKeyType="search"
        />
        <TouchableOpacity onPress={handleSearch} disabled={loading}>
          <Text style={[styles.searchBtn, loading && { opacity: 0.5 }]}>Search</Text>
        </TouchableOpacity>
      </View>

      {loading && results.length === 0 ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#6366f1" />
      ) : (
        <FlatList
          data={results}
          keyExtractor={i => i.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => {
            const isBusy = startingChat === item.username;
            return (
              <TouchableOpacity
                style={styles.userItem}
                onPress={() => startChat(item.username)}
                disabled={startingChat !== null}
                activeOpacity={0.75}
              >
                <View style={styles.avatarWrap}>
                  {item.avatar_url ? (
                    <Image source={{ uri: item.avatar_url }} style={styles.avatar} />
                  ) : (
                    <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.avatarPlaceholder}>
                      <Text style={styles.avatarInitial}>{item.username.charAt(0).toUpperCase()}</Text>
                    </LinearGradient>
                  )}
                </View>
                <View style={styles.userInfo}>
                  <Text style={styles.username}>@{item.username}</Text>
                  <Text style={styles.fullName}>{item.full_name || 'NoteStandard User'}</Text>
                </View>
                {isBusy ? (
                  <ActivityIndicator size="small" color="#6366f1" />
                ) : (
                  <Text style={styles.chatIcon}>💬</Text>
                )}
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            query && !loading ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyIcon}>🔍</Text>
                <Text style={styles.emptyText}>No users found for "{query}"</Text>
                <Text style={styles.emptyHint}>Try a different username</Text>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    gap: 12,
    borderBottomWidth: 1,
    borderColor: '#111133',
  },
  backBtn: { color: '#666', fontSize: 24, padding: 4 },
  searchInput: {
    flex: 1,
    backgroundColor: '#0d0d1e',
    color: '#fff',
    padding: 12,
    borderRadius: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#111133',
  },
  searchBtn: { color: '#6366f1', fontWeight: '700', fontSize: 15 },
  list: { padding: 16 },
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0d0d1e',
    padding: 16,
    borderRadius: 18,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#111133',
  },
  avatarWrap: { marginRight: 14 },
  avatar: { width: 50, height: 50, borderRadius: 25 },
  avatarPlaceholder: { width: 50, height: 50, borderRadius: 25, justifyContent: 'center', alignItems: 'center' },
  avatarInitial: { color: '#fff', fontSize: 20, fontWeight: '800' },
  userInfo: { flex: 1 },
  username: { color: '#fff', fontSize: 16, fontWeight: '700' },
  fullName: { color: '#666', fontSize: 13, marginTop: 2 },
  chatIcon: { fontSize: 20 },
  emptyState: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { color: '#aaa', textAlign: 'center', fontSize: 15, fontWeight: '600' },
  emptyHint: { color: '#444', textAlign: 'center', marginTop: 6, fontSize: 13 },
});
