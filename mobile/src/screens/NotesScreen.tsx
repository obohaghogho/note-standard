import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, TextInput,
} from 'react-native';
import apiClient from '../api/apiClient';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../navigation/MainStack';

interface Note {
  id: string;
  title: string;
  content: string;
  is_favorite?: boolean;
  is_pinned?: boolean;
  is_shared?: boolean;
  is_deleted?: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
}

type NoteTab = 'all' | 'favorites' | 'shared' | 'trash';

export default function NotesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const isFocused = useIsFocused();
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeTab, setActiveTab] = useState<NoteTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get(`/notes`);
      setNotes(res.data || []);
    } catch (e: any) {
      console.error('[NotesScreen] Failed to load notes:', e?.message || e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load, isFocused]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const filteredNotes = notes.filter(note => {
    // Filter by tab
    if (activeTab === 'trash') {
      if (!note.deleted_at && !note.is_deleted) return false;
    } else {
      if (note.deleted_at || note.is_deleted) return false;
      if (activeTab === 'favorites' && !note.is_favorite) return false;
      if (activeTab === 'shared' && !note.is_shared) return false;
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = note.title?.toLowerCase().includes(q);
      const matchContent = note.content?.toLowerCase().includes(q);
      return matchTitle || matchContent;
    }
    return true;
  });

  const renderNote = ({ item }: { item: Note }) => {
    const preview = item.content?.replace(/<[^>]*>/g, '').slice(0, 120) || 'No content';
    const date = new Date(item.updated_at || item.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

    return (
      <TouchableOpacity 
        style={styles.noteCard} 
        activeOpacity={0.7}
        onPress={() => navigation.navigate('NoteEditor', { noteId: item.id })}
      >
        <View style={[styles.noteAccent, item.is_favorite && { backgroundColor: '#f59e0b' }]} />
        <View style={styles.noteContent}>
          <View style={styles.cardTopRow}>
            <Text style={styles.noteTitle} numberOfLines={1}>{item.title || 'Untitled Note'}</Text>
            {item.is_favorite && <Text style={{ fontSize: 12 }}>⭐</Text>}
            {item.is_pinned && <Text style={{ fontSize: 12 }}>📌</Text>}
          </View>
          <Text style={styles.notePreview} numberOfLines={2}>{preview}</Text>
          <Text style={styles.noteDate}>{date}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Notes Workspace</Text>
          <Text style={styles.subtitle}>{filteredNotes.length} note{filteredNotes.length !== 1 ? 's' : ''}</Text>
        </View>
        <TouchableOpacity 
          style={styles.createBtn}
          onPress={() => navigation.navigate('NoteEditor', {})}
        >
          <Text style={styles.createBtnText}>+ New Note</Text>
        </TouchableOpacity>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchBarContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search notes by title or content..."
          placeholderTextColor="#555"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Tabs Filter Bar */}
      <View style={styles.tabsRow}>
        {(['all', 'favorites', 'shared', 'trash'] as NoteTab[]).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabChip, activeTab === tab && styles.tabChipActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
              {tab === 'all' ? 'All' : tab === 'favorites' ? '⭐ Favorites' : tab === 'shared' ? '👥 Shared' : '🗑 Trash'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#10b981" />
        </View>
      ) : (
        <FlatList
          data={filteredNotes}
          keyExtractor={i => i.id}
          renderItem={renderNote}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyIcon}>📝</Text>
              <Text style={styles.emptyTitle}>No notes found</Text>
              <Text style={styles.emptySub}>
                {searchQuery ? `No notes matching "${searchQuery}"` : `No notes in ${activeTab} section`}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#111133' },
  title: { color: '#fff', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#666', fontSize: 13, marginTop: 2 },
  createBtn: { backgroundColor: '#10b981', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  searchBarContainer: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  searchInput: { backgroundColor: '#111122', color: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#222244', paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  tabsRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  tabChip: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#111122', borderWidth: 1, borderColor: '#222244', alignItems: 'center' },
  tabChipActive: { backgroundColor: '#10b981', borderColor: '#34d399' },
  tabText: { color: '#888', fontSize: 11, fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  list: { padding: 16 },
  noteCard: { flexDirection: 'row', backgroundColor: '#0d0d1e', borderRadius: 16, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#111133' },
  noteAccent: { width: 4, backgroundColor: '#10b981' },
  noteContent: { flex: 1, padding: 16 },
  cardTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  noteTitle: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  notePreview: { color: '#666', fontSize: 13, lineHeight: 19, marginBottom: 10 },
  noteDate: { color: '#444', fontSize: 11 },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySub: { color: '#666', fontSize: 14, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },
});
