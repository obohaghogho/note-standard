import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView, RefreshControl
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import apiClient from '../api/apiClient';
import { notesService } from '../api/notesService';

interface ActivityItem {
  id: string;
  type: 'NOTE' | 'TX';
  title: string;
  subtitle: string;
  date: Date;
  status?: string;
  amount?: string;
}

export default function FeedScreen() {
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const isFocused = useIsFocused();

  const [stats, setStats] = useState({
    notesCount: 0,
    balanceStr: '$0.00',
    unreadNotifs: 0,
  });
  const [recentActivities, setRecentActivities] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const firstName = user?.full_name?.split(' ')[0] || user?.username || user?.email?.split('@')[0] || 'User';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  const loadDashboardData = useCallback(async () => {
    if (!user) return;
    try {
      const [wRes, nRes, notifRes, notesList] = await Promise.allSettled([
        apiClient.get('/wallet'),
        apiClient.get('/wallet/transactions?limit=5'),
        apiClient.get('/notifications'),
        notesService.getNotes(user.id)
      ]);

      let bal = '$0.00';
      let txList: any[] = [];
      let unread = 0;

      if (wRes.status === 'fulfilled') {
        const raw = wRes.value.data;
        const list = Array.isArray(raw) ? raw : (raw?.wallets || []);
        const usd = list.find((w: any) => (w.currency || w.asset || '').toUpperCase() === 'USD');
        const ngn = list.find((w: any) => (w.currency || w.asset || '').toUpperCase() === 'NGN');
        if (usd) bal = `$${(parseFloat(usd.balance) || 0).toFixed(2)}`;
        else if (ngn) bal = `₦${(parseFloat(ngn.balance) || 0).toLocaleString()}`;
      }

      if (nRes.status === 'fulfilled') {
        txList = nRes.value.data?.transactions || nRes.value.data || [];
      }

      if (notifRes.status === 'fulfilled') {
        const notifs = Array.isArray(notifRes.value.data) ? notifRes.value.data : (notifRes.value.data?.notifications || []);
        unread = notifs.filter((n: any) => !n.is_read).length;
      }

      const notesArr = notesList.status === 'fulfilled' ? notesList.value : [];

      setStats({
        notesCount: notesArr.length,
        balanceStr: bal,
        unreadNotifs: unread,
      });

      // Map combined activity feed (Notes + Transactions)
      const noteActs: ActivityItem[] = notesArr.slice(0, 4).map(n => ({
        id: n.id,
        type: 'NOTE',
        title: n.title || 'Untitled Note',
        subtitle: n.content ? n.content.substring(0, 40) + '...' : 'Note updated',
        date: new Date(n.updated_at || n.created_at)
      }));

      const txActs: ActivityItem[] = txList.slice(0, 4).map(t => ({
        id: t.id,
        type: 'TX',
        title: t.display_label || `${t.type || 'Transaction'} (${t.currency || ''})`,
        subtitle: t.status || 'Completed',
        date: new Date(t.created_at),
        status: t.status,
        amount: `${t.type === 'WITHDRAWAL' ? '-' : '+'}${t.amount} ${t.currency || ''}`
      }));

      const combined = [...noteActs, ...txActs]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .slice(0, 6);

      setRecentActivities(combined);
    } catch (e) {
      console.warn('[FeedScreen] Dashboard data load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user]);

  useEffect(() => {
    if (isFocused) {
      loadDashboardData();
    }
  }, [isFocused, loadDashboardData]);

  return (
    <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.gradient}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadDashboardData(); }} tintColor="#6366f1" />
        }
      >
        {/* Top Header Bar */}
        <View style={styles.topHeader}>
          <View>
            <Text style={styles.greeting}>{greeting},</Text>
            <Text style={styles.name}>{firstName} 👋</Text>
          </View>
          
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Search')}>
              <Text style={styles.iconText}>🔍</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.iconBtn} onPress={() => navigation.navigate('Notifications')}>
              <Text style={styles.iconText}>🔔</Text>
              {stats.unreadNotifs > 0 && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{stats.unreadNotifs}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity style={styles.avatarCircle} onPress={() => navigation.navigate('Profile')}>
              <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Hero Banner with Balance & Quick Launch */}
        <LinearGradient colors={['#4f46e5', '#3730a3', '#1e1b4b']} style={styles.heroBanner}>
          <View style={styles.bannerHeader}>
            <View>
              <Text style={styles.bannerLabel}>Total Balance</Text>
              <Text style={styles.balanceText}>{stats.balanceStr}</Text>
            </View>
            <View style={styles.syncedBadge}>
              <Text style={styles.syncedText}>✓ Synced</Text>
            </View>
          </View>

          <View style={styles.heroActionRow}>
            <TouchableOpacity style={styles.launchBtn} onPress={() => navigation.navigate('NoteEditor', {})}>
              <Text style={styles.launchBtnText}>+ Launch New Note</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.transferBtn} onPress={() => navigation.navigate('Transfer', {})}>
              <Text style={styles.transferBtnText}>Send P2P ↗</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Quick Actions Bento Grid */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Transfer', {})}>
            <Text style={styles.actionIcon}>💸</Text>
            <Text style={styles.actionTitle}>Send P2P</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('VirtualAccountDetails', {})}>
            <Text style={styles.actionIcon}>🏦</Text>
            <Text style={styles.actionTitle}>Virtual Account</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Exchange', {})}>
            <Text style={styles.actionIcon}>🔂</Text>
            <Text style={styles.actionTitle}>Swap Currency</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.actionCard} onPress={() => navigation.navigate('Search')}>
            <Text style={styles.actionIcon}>🔍</Text>
            <Text style={styles.actionTitle}>Global Search</Text>
          </TouchableOpacity>
        </View>

        {/* Recent Activity Feed */}
        <Text style={styles.sectionTitle}>Recent Activity Momentum</Text>
        <View style={styles.activityFeed}>
          {recentActivities.length === 0 ? (
            <View style={styles.emptyFeed}>
              <Text style={styles.emptyText}>No recent activity yet. Create a note or perform a transaction!</Text>
            </View>
          ) : (
            recentActivities.map(act => (
              <TouchableOpacity
                key={act.id}
                style={styles.activityCard}
                onPress={() => {
                  if (act.type === 'NOTE') navigation.navigate('NoteEditor', { noteId: act.id });
                  else navigation.navigate('Wallet');
                }}
              >
                <View style={[styles.actIconCircle, { backgroundColor: act.type === 'NOTE' ? '#10b98122' : '#6366f122' }]}>
                  <Text style={{ fontSize: 18 }}>{act.type === 'NOTE' ? '📝' : '💳'}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.actTitle} numberOfLines={1}>{act.title}</Text>
                  <Text style={styles.actSub} numberOfLines={1}>{act.subtitle}</Text>
                </View>
                {act.amount && <Text style={styles.actAmount}>{act.amount}</Text>}
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingTop: 50, paddingBottom: 40 },
  topHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 },
  greeting: { color: '#888', fontSize: 13, fontWeight: '600' },
  name: { color: '#fff', fontSize: 24, fontWeight: '900' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBtn: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#111122',
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: '#222244'
  },
  iconText: { fontSize: 18 },
  badge: {
    position: 'absolute', top: 2, right: 2, backgroundColor: '#ef4444',
    borderRadius: 8, minWidth: 16, height: 16, justifyContent: 'center', alignItems: 'center'
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  avatarCircle: {
    width: 42, height: 42, borderRadius: 21, backgroundColor: '#6366f1',
    justifyContent: 'center', alignItems: 'center'
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '800' },
  heroBanner: { borderRadius: 24, padding: 22, marginBottom: 28, borderWidth: 1, borderColor: '#6366f1' },
  bannerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  bannerLabel: { color: '#a5b4fc', fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
  balanceText: { color: '#fff', fontSize: 32, fontWeight: '900', marginTop: 4 },
  syncedBadge: { backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  syncedText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  heroActionRow: { flexDirection: 'row', gap: 10 },
  launchBtn: { flex: 1, backgroundColor: '#fff', paddingVertical: 14, borderRadius: 14, alignItems: 'center' },
  launchBtnText: { color: '#3730a3', fontSize: 14, fontWeight: '800' },
  transferBtn: { backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 14, paddingHorizontal: 16, borderRadius: 14, alignItems: 'center' },
  transferBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  sectionTitle: { color: '#aaa', fontSize: 12, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 28 },
  actionCard: {
    width: '48%', backgroundColor: '#111122', borderRadius: 18, padding: 18,
    borderWidth: 1, borderColor: '#222244', alignItems: 'center'
  },
  actionIcon: { fontSize: 28, marginBottom: 6 },
  actionTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
  activityFeed: { gap: 10 },
  activityCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#111122',
    borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#222244'
  },
  actIconCircle: { width: 40, height: 40, borderRadius: 20, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  actTitle: { color: '#fff', fontSize: 14, fontWeight: '700' },
  actSub: { color: '#888', fontSize: 12, marginTop: 2 },
  actAmount: { color: '#10b981', fontSize: 13, fontWeight: '800', marginLeft: 8 },
  emptyFeed: { backgroundColor: '#111122', padding: 20, borderRadius: 16, alignItems: 'center' },
  emptyText: { color: '#666', fontSize: 13, textAlign: 'center' }
});
