import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, FlatList, Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import apiClient from '../../api/apiClient';

interface IssueItem {
  id: string;
  category: string;
  description: string;
  status: string;
  created_at: string;
}

export default function UserIssueTrackerScreen() {
  const navigation = useNavigation<any>();
  const [category, setCategory] = useState('bug');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [issues, setIssues] = useState<IssueItem[]>([]);
  const [loading, setLoading] = useState(true);

  const categories = [
    { key: 'bug', label: '🐛 Bug Report' },
    { key: 'feature', label: '💡 Feature Request' },
    { key: 'wallet', label: '💳 Financial / Wallet Issue' },
    { key: 'general', label: '💬 General Feedback' },
  ];

  const fetchIssues = async () => {
    try {
      const res = await apiClient.get('/feedback/my-feedback');
      setIssues(res.data || []);
    } catch (e) {
      console.warn('[UserIssueTrackerScreen] Fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchIssues();
  }, []);

  const handleSubmit = async () => {
    if (!description.trim() || description.trim().length < 5) {
      Alert.alert('Incomplete Feedback', 'Please provide a brief description (at least 5 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.post('/feedback', {
        category,
        description: description.trim(),
      });

      Alert.alert('✅ Feedback Submitted', 'Thank you! Our engineering and support team has received your ticket.');
      setDescription('');
      fetchIssues();
    } catch (err: any) {
      Alert.alert('Submission Failed', err.response?.data?.error || 'Could not submit feedback at this time.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Feedback & Support</Text>
        <View style={{ width: 50 }} />
      </View>

      <FlatList
        data={issues}
        keyExtractor={item => item.id || Math.random().toString()}
        ListHeaderComponent={
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Submit New Feedback or Bug Report</Text>

            <Text style={styles.label}>Select Category</Text>
            <View style={styles.catGrid}>
              {categories.map(c => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.catChip, category === c.key && styles.catChipActive]}
                  onPress={() => setCategory(c.key)}
                >
                  <Text style={[styles.catText, category === c.key && styles.catTextActive]}>{c.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Description & Details</Text>
            <TextInput
              style={styles.textArea}
              placeholder="Describe what happened or what feature you would like to see..."
              placeholderTextColor="#555577"
              multiline
              numberOfLines={4}
              value={description}
              onChangeText={setDescription}
            />

            <TouchableOpacity
              style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Submit Ticket</Text>}
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Your Past Feedback ({issues.length})</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={styles.issueCard}>
            <View style={styles.issueHeader}>
              <Text style={styles.issueCategory}>{item.category.toUpperCase()}</Text>
              <Text style={[styles.statusBadge, { color: item.status === 'resolved' ? '#10b981' : '#f59e0b' }]}>
                ● {item.status || 'Pending'}
              </Text>
            </View>
            <Text style={styles.issueDesc}>{item.description}</Text>
            <Text style={styles.issueDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
          </View>
        )}
        ListEmptyComponent={
          !loading ? <Text style={styles.emptyText}>No submitted issues yet.</Text> : null
        }
        contentContainerStyle={styles.listContent}
      />
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
  backBtn: { padding: 4 },
  backText: { color: '#6366f1', fontSize: 16, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  listContent: { padding: 20 },
  formCard: {
    backgroundColor: '#111122', borderRadius: 20, padding: 20, borderWidth: 1,
    borderColor: '#222244', marginBottom: 24
  },
  formTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 16 },
  label: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8 },
  catGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 18 },
  catChip: {
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, backgroundColor: '#060611',
    borderWidth: 1, borderColor: '#222244'
  },
  catChipActive: { backgroundColor: '#6366f1', borderColor: '#818cf8' },
  catText: { color: '#888', fontSize: 13, fontWeight: '600' },
  catTextActive: { color: '#fff' },
  textArea: {
    backgroundColor: '#060611', color: '#fff', borderRadius: 14, borderWidth: 1,
    borderColor: '#222244', paddingHorizontal: 16, paddingVertical: 12, fontSize: 14,
    height: 100, textAlignVertical: 'top', marginBottom: 20
  },
  submitBtn: { backgroundColor: '#6366f1', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 24 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  sectionTitle: { color: '#aaa', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1 },
  issueCard: {
    backgroundColor: '#111122', borderRadius: 16, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: '#222244'
  },
  issueHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  issueCategory: { color: '#6366f1', fontSize: 12, fontWeight: '800' },
  statusBadge: { fontSize: 12, fontWeight: '700' },
  issueDesc: { color: '#fff', fontSize: 14, lineHeight: 20, marginBottom: 8 },
  issueDate: { color: '#555', fontSize: 11 },
  emptyText: { color: '#666', fontSize: 13, textAlign: 'center', marginVertical: 10 }
});
