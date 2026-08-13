import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import apiClient from '../../api/apiClient';

export default function CreateTeamModal() {
  const navigation = useNavigation<any>();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAction = async () => {
    setLoading(true);
    try {
      if (mode === 'create') {
        if (!name.trim()) {
          Alert.alert('Error', 'Please enter a team name');
          return;
        }
        const res = await apiClient.post('/teams', { name: name.trim(), description: description.trim() });
        Alert.alert('✅ Team Created', `Workspace "${name}" created successfully!`, [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        if (!inviteCode.trim()) {
          Alert.alert('Error', 'Please enter a valid invite code');
          return;
        }
        const res = await apiClient.post('/teams/join', { invite_code: inviteCode.trim() });
        Alert.alert('✅ Joined Team', 'You have successfully joined the team workspace!', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (err: any) {
      Alert.alert('Action Failed', err.response?.data?.error || 'Could not complete team action.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{mode === 'create' ? 'Create Team' : 'Join Team'}</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        {/* Mode Switcher */}
        <View style={styles.modeRow}>
          <TouchableOpacity
            style={[styles.modeChip, mode === 'create' && styles.modeChipActive]}
            onPress={() => setMode('create')}
          >
            <Text style={[styles.modeText, mode === 'create' && styles.modeTextActive]}>Create Workspace</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.modeChip, mode === 'join' && styles.modeChipActive]}
            onPress={() => setMode('join')}
          >
            <Text style={[styles.modeText, mode === 'join' && styles.modeTextActive]}>Join via Code</Text>
          </TouchableOpacity>
        </View>

        {mode === 'create' ? (
          <>
            <Text style={styles.label}>Team Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Core Engineering"
              placeholderTextColor="#555"
              value={name}
              onChangeText={setName}
            />

            <Text style={styles.label}>Description (Optional)</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              placeholder="What is this team working on?"
              placeholderTextColor="#555"
              multiline
              value={description}
              onChangeText={setDescription}
            />
          </>
        ) : (
          <>
            <Text style={styles.label}>Enter Team Invite Code</Text>
            <TextInput
              style={[styles.input, { fontSize: 20, letterSpacing: 2, fontWeight: '800' }]}
              placeholder="e.g. TEAM-9876"
              placeholderTextColor="#555"
              autoCapitalize="characters"
              value={inviteCode}
              onChangeText={setInviteCode}
            />
          </>
        )}

        <TouchableOpacity
          style={[styles.submitBtn, loading && { opacity: 0.6 }]}
          onPress={handleAction}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>{mode === 'create' ? 'Create Team Now' : 'Join Workspace'}</Text>
          )}
        </TouchableOpacity>
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
  content: { padding: 20 },
  modeRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  modeChip: {
    flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#111122',
    borderWidth: 1, borderColor: '#222244', alignItems: 'center'
  },
  modeChipActive: { backgroundColor: '#6366f1', borderColor: '#818cf8' },
  modeText: { color: '#888', fontSize: 13, fontWeight: '700' },
  modeTextActive: { color: '#fff' },
  label: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  input: {
    backgroundColor: '#111122', color: '#fff', borderRadius: 14, borderWidth: 1,
    borderColor: '#222244', paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, marginBottom: 20
  },
  submitBtn: {
    backgroundColor: '#6366f1', paddingVertical: 16, borderRadius: 14, alignItems: 'center', marginTop: 10
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' }
});
