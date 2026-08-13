import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, FlatList, Alert, TextInput
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import apiClient from '../../api/apiClient';

export default function TeamDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { teamId } = route.params || {};

  const [team, setTeam] = useState<any>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [channels, setChannels] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'channels' | 'members' | 'notes'>('channels');
  const [loading, setLoading] = useState(true);
  const [inviteCode, setInviteCode] = useState('');

  useEffect(() => {
    async function loadTeamData() {
      if (!teamId) return;
      setLoading(true);
      try {
        const [teamRes, memRes, chanRes] = await Promise.allSettled([
          apiClient.get(`/teams/${teamId}`),
          apiClient.get(`/teams/${teamId}/members`),
          apiClient.get(`/teams/${teamId}/channels`),
        ]);

        if (teamRes.status === 'fulfilled') setTeam(teamRes.value.data);
        if (memRes.status === 'fulfilled') setMembers(memRes.value.data || []);
        if (chanRes.status === 'fulfilled') setChannels(chanRes.value.data || []);
      } catch (e) {
        console.warn('[TeamDetailScreen] Fetch error:', e);
      } finally {
        setLoading(false);
      }
    }
    loadTeamData();
  }, [teamId]);

  if (loading) {
    return (
      <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#6366f1" />
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{team?.name || 'Team Workspace'}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Team Banner */}
        <View style={styles.teamCard}>
          <Text style={styles.teamTitle}>{team?.name || 'Workspace'}</Text>
          <Text style={styles.teamDesc}>{team?.description || 'Collaborative team workspace'}</Text>
          {team?.invite_code && (
            <View style={styles.inviteBadge}>
              <Text style={styles.inviteText}>Invite Code: {team.invite_code}</Text>
            </View>
          )}
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabChip, activeTab === 'channels' && styles.tabChipActive]}
            onPress={() => setActiveTab('channels')}
          >
            <Text style={[styles.tabText, activeTab === 'channels' && styles.tabTextActive]}>Channels</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabChip, activeTab === 'members' && styles.tabChipActive]}
            onPress={() => setActiveTab('members')}
          >
            <Text style={[styles.tabText, activeTab === 'members' && styles.tabTextActive]}>Members ({members.length})</Text>
          </TouchableOpacity>
        </View>

        {activeTab === 'channels' ? (
          <View style={styles.section}>
            {channels.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}># general (default channel)</Text>
              </View>
            ) : (
              channels.map(c => (
                <View key={c.id} style={styles.channelCard}>
                  <Text style={styles.channelName}># {c.name}</Text>
                  <Text style={styles.channelDesc}>{c.description || 'Channel conversation'}</Text>
                </View>
              ))
            )}
          </View>
        ) : (
          <View style={styles.section}>
            {members.map(m => (
              <View key={m.id || m.user_id} style={styles.memberCard}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {(m.profile?.full_name || m.profile?.username || 'M').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.memberName}>{m.profile?.full_name || m.profile?.username || 'Member'}</Text>
                  <Text style={styles.memberRole}>{m.role || 'Member'}</Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
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
  content: { padding: 20 },
  teamCard: {
    backgroundColor: '#111122', borderRadius: 20, padding: 20, borderWidth: 1,
    borderColor: '#222244', marginBottom: 20
  },
  teamTitle: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 6 },
  teamDesc: { color: '#888', fontSize: 13, lineHeight: 18, marginBottom: 12 },
  inviteBadge: { backgroundColor: '#1e1b4b', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, alignSelf: 'flex-start' },
  inviteText: { color: '#818cf8', fontSize: 12, fontWeight: '700' },
  tabRow: { flexDirection: 'row', gap: 10, marginBottom: 20 },
  tabChip: {
    flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#111122',
    borderWidth: 1, borderColor: '#222244', alignItems: 'center'
  },
  tabChipActive: { backgroundColor: '#6366f1', borderColor: '#818cf8' },
  tabText: { color: '#888', fontSize: 13, fontWeight: '700' },
  tabTextActive: { color: '#fff' },
  section: { gap: 10 },
  emptyCard: { backgroundColor: '#111122', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#222244' },
  emptyText: { color: '#818cf8', fontSize: 14, fontWeight: '700' },
  channelCard: { backgroundColor: '#111122', padding: 16, borderRadius: 14, borderWidth: 1, borderColor: '#222244' },
  channelName: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 4 },
  channelDesc: { color: '#888', fontSize: 12 },
  memberCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#111122', padding: 14, borderRadius: 14, borderWidth: 1, borderColor: '#222244' },
  avatarCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  memberName: { color: '#fff', fontSize: 15, fontWeight: '700' },
  memberRole: { color: '#818cf8', fontSize: 12 }
});
