import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  FlatList, RefreshControl
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import apiClient from '../../api/apiClient';

interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  is_read: boolean;
  created_at: string;
}

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = async () => {
    try {
      const res = await apiClient.get('/notifications');
      const list = Array.isArray(res.data) ? res.data : (res.data?.notifications || []);
      setNotifications(list);
    } catch (e) {
      console.warn('[NotificationsScreen] Fetch error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const markAsRead = async (id: string) => {
    try {
      await apiClient.patch(`/notifications/${id}/read`);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch (e) {
      console.warn('Mark read failed:', e);
    }
  };

  const markAllRead = async () => {
    try {
      await apiClient.post('/notifications/read-all');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch (e) {
      console.warn('Mark all read failed:', e);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'all') return true;
    if (filter === 'financial') return ['deposit', 'withdrawal', 'transfer', 'swap', 'financial'].includes(n.type?.toLowerCase());
    if (filter === 'chat') return ['chat', 'message', 'call'].includes(n.type?.toLowerCase());
    return true;
  });

  return (
    <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={markAllRead} style={styles.readAllBtn}>
          <Text style={styles.readAllText}>Mark Read</Text>
        </TouchableOpacity>
      </View>

      {/* Filters */}
      <View style={styles.filterRow}>
        {(['all', 'financial', 'chat'] as string[]).map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f.toUpperCase()}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#6366f1" />
        </View>
      ) : (
        <FlatList
          data={filteredNotifications}
          keyExtractor={item => item.id || Math.random().toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchNotifications(); }} tintColor="#6366f1" />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.notifCard, !item.is_read && styles.notifUnread]}
              onPress={() => markAsRead(item.id)}
            >
              <View style={styles.notifHeader}>
                <Text style={styles.notifTitle}>{item.title || 'Notification'}</Text>
                {!item.is_read && <View style={styles.unreadDot} />}
              </View>
              <Text style={styles.notifBody}>{item.body}</Text>
              <Text style={styles.notifDate}>{new Date(item.created_at).toLocaleString()}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>🔔</Text>
              <Text style={styles.emptyTitle}>No Notifications</Text>
              <Text style={styles.emptyText}>You're all caught up!</Text>
            </View>
          }
        />
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
  readAllBtn: { padding: 4 },
  readAllText: { color: '#818cf8', fontSize: 13, fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  filterChip: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#111122',
    borderWidth: 1, borderColor: '#222244'
  },
  filterChipActive: { backgroundColor: '#6366f1', borderColor: '#818cf8' },
  filterText: { color: '#888', fontSize: 12, fontWeight: '700' },
  filterTextActive: { color: '#fff' },
  listContent: { padding: 20 },
  notifCard: {
    backgroundColor: '#111122', borderRadius: 16, padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: '#222244'
  },
  notifUnread: { borderColor: '#6366f1', backgroundColor: '#16162a' },
  notifHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  notifTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#6366f1' },
  notifBody: { color: '#888', fontSize: 13, lineHeight: 18, marginBottom: 8 },
  notifDate: { color: '#555', fontSize: 11 },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyIcon: { fontSize: 44, marginBottom: 12 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  emptyText: { color: '#888', fontSize: 13 }
});
