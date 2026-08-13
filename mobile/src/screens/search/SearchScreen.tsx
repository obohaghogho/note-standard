import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, FlatList, ScrollView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import apiClient from '../../api/apiClient';

export default function SearchScreen() {
  const navigation = useNavigation<any>();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{
    notes?: any[];
    chats?: any[];
    teams?: any[];
    users?: any[];
  }>({});

  const handleSearch = async (text: string) => {
    setQuery(text);
    if (!text || text.length < 2) {
      setResults({});
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.get(`/search?q=${encodeURIComponent(text)}`);
      setResults(res.data || {});
    } catch (e) {
      console.warn('[SearchScreen] Global search error:', e);
    } finally {
      setLoading(false);
    }
  };

  const hasResults =
    (results.notes?.length || 0) +
    (results.chats?.length || 0) +
    (results.teams?.length || 0) +
    (results.users?.length || 0) > 0;

  return (
    <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Global Search</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search notes, chats, teams, users..."
          placeholderTextColor="#555577"
          value={query}
          onChangeText={handleSearch}
          autoFocus
        />
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          {/* Notes Results */}
          {results.notes && results.notes.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📝 Notes ({results.notes.length})</Text>
              {results.notes.map(n => (
                <TouchableOpacity
                  key={n.id}
                  style={styles.card}
                  onPress={() => navigation.navigate('NoteEditor', { noteId: n.id })}
                >
                  <Text style={styles.cardTitle}>{n.title || 'Untitled Note'}</Text>
                  <Text style={styles.cardSub} numberOfLines={1}>{n.content}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Users Results */}
          {results.users && results.users.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>👤 People ({results.users.length})</Text>
              {results.users.map(u => (
                <TouchableOpacity
                  key={u.id}
                  style={styles.card}
                  onPress={() => navigation.navigate('PublicProfile', { userId: u.id })}
                >
                  <Text style={styles.cardTitle}>{u.full_name || u.username}</Text>
                  <Text style={styles.cardSub}>@{u.username || 'user'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Teams Results */}
          {results.teams && results.teams.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>👥 Teams ({results.teams.length})</Text>
              {results.teams.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.card}
                  onPress={() => navigation.navigate('TeamDetail', { teamId: t.id })}
                >
                  <Text style={styles.cardTitle}>{t.name}</Text>
                  <Text style={styles.cardSub}>{t.description || 'Workspace'}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {!hasResults && query.length > 1 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔍</Text>
              <Text style={styles.emptyTitle}>No Results Found</Text>
              <Text style={styles.emptyText}>No matching notes, people, or teams found for "{query}".</Text>
            </View>
          )}

          {query.length <= 1 && (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>✨</Text>
              <Text style={styles.emptyTitle}>Search Anything</Text>
              <Text style={styles.emptyText}>Type keywords above to search across your workspace notes, chats, teams, and members.</Text>
            </View>
          )}
        </ScrollView>
      )}
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
  searchBarContainer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  searchInput: {
    backgroundColor: '#111122', color: '#fff', borderRadius: 14, borderWidth: 1,
    borderColor: '#222244', paddingHorizontal: 16, paddingVertical: 14, fontSize: 15
  },
  content: { padding: 20 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#aaa', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 10, letterSpacing: 1 },
  card: {
    backgroundColor: '#111122', borderRadius: 14, padding: 16, marginBottom: 8,
    borderWidth: 1, borderColor: '#222244'
  },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  cardSub: { color: '#888', fontSize: 12 },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 6 },
  emptyText: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 18 }
});
