import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import axios from 'axios';
import { AuthService } from '../services/AuthService';
import { API_URL } from '../Config';
import apiClient from '../api/apiClient';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../navigation/MainStack';

interface Note {
  id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
}

export default function NotesScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const isFocused = useIsFocused();
  const [notes, setNotes] = useState<Note[]>([]);
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
        <TouchableOpacity 
          style={styles.createBtn}
          onPress={() => navigation.navigate('NoteEditor', {})}
        >
          <Text style={styles.createBtnText}>+ New Note</Text>
        </TouchableOpacity>
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
  createBtn: { backgroundColor: '#10b981', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  createBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
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
