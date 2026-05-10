import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import apiClient from '../api/apiClient';
import { useNavigation, useRoute } from '@react-navigation/native';

export default function NoteEditorScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { noteId } = route.params || {};

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (noteId) {
      loadNote();
    }
  }, [noteId]);

  const loadNote = async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/notes/${noteId}`);
      setTitle(res.data.title || '');
      setContent(res.data.content || '');
    } catch (e) {
      Alert.alert('Error', 'Failed to load note');
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      Alert.alert('Wait', 'Please enter a title for your note.');
      return;
    }

    setSaving(true);
    try {
      const payload = { title, content };

      if (noteId) {
        await apiClient.put(`/notes/${noteId}`, payload);
      } else {
        await apiClient.post(`/notes`, payload);
      }
      
      Alert.alert('Success', 'Note saved successfully');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Error', 'Failed to save note');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Note',
      'Are you sure you want to delete this note?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive', 
          onPress: async () => {
            try {
              await apiClient.delete(`/notes/${noteId}`);
              navigation.goBack();
            } catch (e) {
              Alert.alert('Error', 'Failed to delete note');
            }
          } 
        },
      ]
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
    <KeyboardAvoidingView 
      style={styles.container} 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.headerBtn}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{noteId ? 'Edit Note' : 'New Note'}</Text>
        <TouchableOpacity onPress={handleSave} disabled={saving}>
          {saving ? (
            <ActivityIndicator size="small" color="#10b981" />
          ) : (
            <Text style={[styles.headerBtn, { color: '#10b981' }]}>Save</Text>
          )}
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        <TextInput
          style={styles.titleInput}
          placeholder="Title"
          placeholderTextColor="#444"
          value={title}
          onChangeText={setTitle}
          multiline
        />
        <TextInput
          style={styles.contentInput}
          placeholder="Start writing..."
          placeholderTextColor="#444"
          value={content}
          onChangeText={setContent}
          multiline
          textAlignVertical="top"
        />

        {noteId && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteBtnText}>Delete Note</Text>
          </TouchableOpacity>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060611' },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingTop: 60, 
    paddingBottom: 16, 
    borderBottomWidth: 1, 
    borderColor: '#111133' 
  },
  headerBtn: { color: '#666', fontSize: 16, fontWeight: '600' },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  content: { flex: 1, padding: 20 },
  titleInput: { 
    color: '#fff', 
    fontSize: 24, 
    fontWeight: '800', 
    marginBottom: 20,
    padding: 0 
  },
  contentInput: { 
    color: '#ccc', 
    fontSize: 16, 
    lineHeight: 24,
    minHeight: 300,
    padding: 0 
  },
  deleteBtn: { 
    marginTop: 40, 
    padding: 16, 
    backgroundColor: '#ef444411', 
    borderRadius: 12, 
    alignItems: 'center',
    marginBottom: 40
  },
  deleteBtnText: { color: '#ef4444', fontWeight: '700' },
});
