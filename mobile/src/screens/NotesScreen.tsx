import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import axios from 'axios';
import { AuthService } from '../services/AuthService';
import { API_URL } from '../Config';

interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export default function NotesScreen() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const token = await AuthService.getToken();
      const res = await axios.get(`${API_URL}/api/notes`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setNotes(res.data || []);
    } catch (e) {
      console.error('[NotesScreen] Failed to load notes:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const renderNote = ({ item }: { item: Note }) => {
    const preview = item.content?.replace(/<[^>]*>/g, '').slice(0, 120) || 'No content';
    const date = new Date(item.updated_at || item.created_at).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });

    return (
      <TouchableOpacity style={styles.noteCard} activeOpacity={0.7}>
        <View style={styles.noteAccent} />
        <View style={styles.noteContent}>
          <Text style={styles.noteTitle} numberOfLines={1}>{item.title || 'Untitled Note'}</Text>
          <Text style={styles.notePreview} numberOfLines={2}>{preview}</Text>
          <Text style={styles.noteDate}>{date}</Text>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Notes</Text>
          <Text style={styles.subtitle}>{notes.length} note{notes.length !== 1 ? 's' : ''}</Text>
        </View>
      </View>

      <FlatList
        data={notes}
        keyExtractor={i => i.id}
        renderItem={renderNote}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#10b981" />}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📝</Text>
            <Text style={styles.emptyTitle}>No notes yet</Text>
            <Text style={styles.emptySub}>Create notes from the web app to see them here</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060611' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16, borderBottomWidth: 1, borderColor: '#111133' },
  title: { color: '#fff', fontSize: 26, fontWeight: '800' },
  subtitle: { color: '#666', fontSize: 13, marginTop: 2 },
  list: { padding: 16 },
  noteCard: { flexDirection: 'row', backgroundColor: '#0d0d1e', borderRadius: 16, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#111133' },
  noteAccent: { width: 4, backgroundColor: '#10b981' },
  noteContent: { flex: 1, padding: 16 },
  noteTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 6 },
  notePreview: { color: '#666', fontSize: 13, lineHeight: 19, marginBottom: 10 },
  noteDate: { color: '#444', fontSize: 11 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  emptySub: { color: '#666', fontSize: 14, marginTop: 6, textAlign: 'center', paddingHorizontal: 32 },
});
