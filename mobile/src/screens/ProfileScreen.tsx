import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';

const MenuItem = ({ icon, label, value, onPress, danger }: { icon: string; label: string; value?: string; onPress?: () => void; danger?: boolean }) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.menuLeft}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <View>
        <Text style={[styles.menuLabel, danger && styles.dangerText]}>{label}</Text>
        {value && <Text style={styles.menuValue}>{value}</Text>}
      </View>
    </View>
    {!danger && <Text style={styles.menuChevron}>›</Text>}
  </TouchableOpacity>
);

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const name = user?.full_name || 'User';
  const email = user?.email || '';
  const initial = name.charAt(0).toUpperCase();

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: logout },
      ],
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Profile Header */}
      <LinearGradient colors={['#111133', '#0d0d1e']} style={styles.profileHeader}>
        <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </LinearGradient>
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.email}>{email}</Text>
        <View style={styles.planBadge}>
          <Text style={styles.planText}>✦ Free Plan</Text>
        </View>
      </LinearGradient>

      {/* Account Section */}
      <Text style={styles.sectionLabel}>Account</Text>
      <View style={styles.section}>
        <MenuItem icon="👤" label="Full Name" value={name} />
        <MenuItem icon="✉️" label="Email" value={email} />
        <MenuItem icon="🔒" label="Change Password" />
      </View>

      {/* App Section */}
      <Text style={styles.sectionLabel}>App</Text>
      <View style={styles.section}>
        <MenuItem icon="🔔" label="Notifications" />
        <MenuItem icon="🎨" label="Appearance" value="Dark" />
        <MenuItem icon="📱" label="App Version" value="1.1.13" />
      </View>

      {/* Danger Zone */}
      <Text style={styles.sectionLabel}>Session</Text>
      <View style={styles.section}>
        <MenuItem icon="🚪" label="Sign Out" onPress={handleLogout} danger />
      </View>

      <Text style={styles.footer}>NoteStandard v1.1.13 • Made with ❤️</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  content: { paddingBottom: 48 },
  profileHeader: { alignItems: 'center', paddingTop: 72, paddingBottom: 32, paddingHorizontal: 24, marginBottom: 24 },
  avatar: { width: 88, height: 88, borderRadius: 44, justifyContent: 'center', alignItems: 'center', marginBottom: 16, shadowColor: '#6366f1', shadowOpacity: 0.5, shadowRadius: 20 },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '900' },
  name: { color: '#fff', fontSize: 22, fontWeight: '800' },
  email: { color: '#666', fontSize: 14, marginTop: 4 },
  planBadge: { marginTop: 12, backgroundColor: '#6366f122', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: '#6366f144' },
  planText: { color: '#6366f1', fontSize: 13, fontWeight: '700' },
  sectionLabel: { color: '#444', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, paddingHorizontal: 20, marginBottom: 8, marginTop: 16 },
  section: { backgroundColor: '#0d0d1e', marginHorizontal: 16, borderRadius: 18, borderWidth: 1, borderColor: '#111133', overflow: 'hidden' },
  menuItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderColor: '#111133' },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuIcon: { fontSize: 18 },
  menuLabel: { color: '#fff', fontSize: 15, fontWeight: '500' },
  menuValue: { color: '#555', fontSize: 12, marginTop: 2 },
  menuChevron: { color: '#333', fontSize: 22 },
  dangerText: { color: '#ef4444' },
  footer: { color: '#333', fontSize: 12, textAlign: 'center', marginTop: 32 },
});
