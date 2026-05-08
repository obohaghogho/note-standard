import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import { MainTabParamList } from '../navigation/MainTabs';

type Props = { navigation: BottomTabNavigationProp<MainTabParamList, 'Home'> };

const QuickAction = ({ icon, label, color, onPress }: { icon: string; label: string; color: string; onPress: () => void }) => (
  <TouchableOpacity style={[styles.quickAction, { borderColor: color + '33' }]} onPress={onPress}>
    <Text style={styles.quickIcon}>{icon}</Text>
    <Text style={styles.quickLabel}>{label}</Text>
  </TouchableOpacity>
);

const StatCard = ({ value, label, color }: { value: string; label: string; color: string }) => (
  <View style={[styles.statCard, { borderColor: color + '44' }]}>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

export default function FeedScreen({ navigation }: Props) {
  const { user } = useAuth();
  const firstName = user?.full_name?.split(' ')[0] || user?.email?.split('@')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.gradient}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>{greeting},</Text>
            <Text style={styles.name}>{firstName} 👋</Text>
          </View>
          <View style={styles.avatarCircle}>
            <Text style={styles.avatarText}>{firstName.charAt(0).toUpperCase()}</Text>
          </View>
        </View>

        {/* Hero Banner */}
        <LinearGradient colors={['#6366f1', '#4f46e5', '#3730a3']} style={styles.banner} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
          <Text style={styles.bannerTitle}>NoteStandard</Text>
          <Text style={styles.bannerSubtitle}>Your all-in-one productivity platform</Text>
          <View style={styles.bannerBadge}>
            <Text style={styles.bannerBadgeText}>✓ Connected</Text>
          </View>
        </LinearGradient>

        {/* Stats */}
        <Text style={styles.sectionTitle}>Your Activity</Text>
        <View style={styles.statsRow}>
          <StatCard value="—" label="Messages" color="#6366f1" />
          <StatCard value="—" label="Notes" color="#10b981" />
          <StatCard value="—" label="Calls" color="#f59e0b" />
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <QuickAction icon="💬" label="Chat" color="#6366f1" onPress={() => navigation.navigate('Chat')} />
          <QuickAction icon="📝" label="Notes" color="#10b981" onPress={() => navigation.navigate('Notes')} />
          <QuickAction icon="👥" label="Social" color="#f59e0b" onPress={() => navigation.navigate('Social')} />
          <QuickAction icon="👤" label="Profile" color="#ec4899" onPress={() => navigation.navigate('Profile')} />
        </View>

        {/* Tips */}
        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>💡 Getting Started</Text>
          <Text style={styles.tipText}>Open Chat to message your contacts, or head to Social to connect with new friends.</Text>
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  scroll: { flex: 1 },
  content: { padding: 20, paddingTop: 60, paddingBottom: 40 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  greeting: { color: '#666', fontSize: 14 },
  name: { color: '#fff', fontSize: 26, fontWeight: '800' },
  avatarCircle: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#6366f1', justifyContent: 'center', alignItems: 'center' },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '800' },
  banner: { borderRadius: 20, padding: 24, marginBottom: 32 },
  bannerTitle: { color: '#fff', fontSize: 22, fontWeight: '800' },
  bannerSubtitle: { color: 'rgba(255,255,255,0.8)', fontSize: 13, marginTop: 4 },
  bannerBadge: { marginTop: 16, backgroundColor: 'rgba(255,255,255,0.2)', alignSelf: 'flex-start', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  bannerBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  sectionTitle: { color: '#aaa', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 },
  statsRow: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  statCard: { flex: 1, backgroundColor: '#111122', borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1 },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: { color: '#666', fontSize: 11, marginTop: 4 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 32 },
  quickAction: { width: '47%', backgroundColor: '#111122', borderRadius: 18, padding: 20, alignItems: 'center', borderWidth: 1 },
  quickIcon: { fontSize: 28, marginBottom: 8 },
  quickLabel: { color: '#fff', fontSize: 14, fontWeight: '600' },
  tipCard: { backgroundColor: '#111122', borderRadius: 16, padding: 20, borderWidth: 1, borderColor: '#1e1e3a' },
  tipTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  tipText: { color: '#666', fontSize: 13, lineHeight: 20 },
});
