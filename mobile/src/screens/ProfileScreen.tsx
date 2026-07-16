import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Modal, TextInput, ActivityIndicator
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/apiClient';
import { useNavigation } from '@react-navigation/native';

const MenuItem = ({
  icon, label, value, onPress, danger
}: {
  icon: string; label: string; value?: string; onPress?: () => void; danger?: boolean;
}) => (
  <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
    <View style={styles.menuLeft}>
      <Text style={styles.menuIcon}>{icon}</Text>
      <View>
        <Text style={[styles.menuLabel, danger && styles.dangerText]}>{label}</Text>
        {value ? <Text style={styles.menuValue}>{value}</Text> : null}
      </View>
    </View>
    {!danger && <Text style={styles.menuChevron}>›</Text>}
  </TouchableOpacity>
);

export default function ProfileScreen() {
  const { user, accounts, logout, switchAccount, removeAccount, addAccount } = useAuth();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const navigation = useNavigation<any>();

  const name = user?.full_name || user?.username || 'User';
  const email = user?.email || '';
  const plan = user?.plan_tier || 'FREE';
  const initial = name.charAt(0).toUpperCase();

  const handleLogout = () => {
    Alert.alert(
      'Sign Out',
      'This will clear all saved accounts. Are you sure?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear All', style: 'destructive', onPress: logout },
      ],
    );
  };

  const handleChangePassword = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Error', 'New password must be at least 6 characters');
      return;
    }
    setUpdatingPassword(true);
    try {
      await apiClient.post(`/auth/change-password`, { currentPassword, newPassword });
      Alert.alert('Success', 'Password changed successfully');
      setShowPasswordModal(false);
      setCurrentPassword('');
      setNewPassword('');
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to change password');
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleSupport = async () => {
    try {
      const res = await apiClient.post('/chat/support');
      navigation.navigate('Chat', { conversationId: res.data.id });
    } catch (e) {
      Alert.alert('Error', 'Failed to start support chat');
    }
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
          <Text style={styles.planText}>✦ {plan.toUpperCase()} PLAN</Text>
        </View>
      </LinearGradient>

      {/* Account Section */}
      <Text style={styles.sectionLabel}>Account Settings</Text>
      <View style={styles.section}>
        <MenuItem icon="👤" label="Full Name" value={name} />
        <MenuItem icon="📧" label="Email" value={email} />
        <MenuItem icon="🔒" label="Change Password" onPress={() => setShowPasswordModal(true)} />
      </View>

      {/* Multi-Account Management */}
      <Text style={styles.sectionLabel}>Switch Account</Text>
      <View style={styles.section}>
        {accounts.map(acc => (
          <View key={acc.id} style={styles.accountItem}>
            <TouchableOpacity 
              style={styles.accountInfo} 
              onPress={() => acc.id !== user?.id && switchAccount(acc.id)}
            >
              <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.miniAvatar}>
                <Text style={styles.miniAvatarText}>{acc.full_name?.charAt(0) || acc.username.charAt(0)}</Text>
              </LinearGradient>
              <View style={styles.accountText}>
                <Text style={styles.accountName}>{acc.full_name || acc.username}</Text>
                <Text style={styles.accountEmail}>{acc.email}</Text>
              </View>
              {acc.id === user?.id && <Text style={styles.activeTag}>Active</Text>}
            </TouchableOpacity>
            {acc.id !== user?.id && (
              <TouchableOpacity onPress={() => removeAccount(acc.id)} style={styles.removeBtn}>
                <Text style={styles.removeBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        <TouchableOpacity style={styles.addAccountBtn} onPress={addAccount}>
          <Text style={styles.addAccountText}>+ Add another account</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Preferences</Text>
      <View style={styles.section}>
        <MenuItem
          icon="🔔"
          label="Notifications"
          value="Device Settings"
          onPress={() => Alert.alert('Notifications', 'Managed in device Settings')}
        />
        <MenuItem
          icon="🎨"
          label="Appearance"
          value="Dark Theme"
          onPress={() => Alert.alert('Appearance', 'Optimized for comfort')}
        />
        <MenuItem icon="📱" label="App Version" value="1.4.2" />
      </View>

      <Text style={styles.sectionLabel}>Support</Text>
      <View style={styles.section}>
        <MenuItem icon="💬" label="Need Help" onPress={handleSupport} />
      </View>

      {/* Session */}
      <Text style={styles.sectionLabel}>Session</Text>
      <View style={styles.section}>
        <MenuItem icon="🚪" label="Sign Out & Clear All" onPress={handleLogout} danger />
      </View>

      <Text style={styles.footer}>NoteStandard v1.4.2 • Made with ❤️</Text>

      {/* Password Change Modal */}
      <Modal
        visible={showPasswordModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowPasswordModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Change Password</Text>
            <Text style={styles.modalLabel}>Current Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter current password"
              placeholderTextColor="#444"
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
            />
            <Text style={styles.modalLabel}>New Password</Text>
            <TextInput
              style={styles.input}
              placeholder="Min 6 characters"
              placeholderTextColor="#444"
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => { setShowPasswordModal(false); setCurrentPassword(''); setNewPassword(''); }}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={handleChangePassword}
                disabled={updatingPassword}
              >
                {updatingPassword
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.confirmBtnText}>Update</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  content: { paddingBottom: 48 },
  profileHeader: {
    alignItems: 'center', paddingTop: 72, paddingBottom: 32,
    paddingHorizontal: 24, marginBottom: 24,
  },
  avatar: {
    width: 88, height: 88, borderRadius: 44,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 16, shadowColor: '#6366f1', shadowOpacity: 0.5, shadowRadius: 20,
  },
  avatarText: { color: '#fff', fontSize: 36, fontWeight: '900' },
  name: { color: '#fff', fontSize: 22, fontWeight: '800' },
  email: { color: '#999', fontSize: 14, marginTop: 4 },
  planBadge: {
    marginTop: 12, backgroundColor: '#6366f122', borderRadius: 20,
    paddingHorizontal: 16, paddingVertical: 6, borderWidth: 1, borderColor: '#6366f144',
  },
  planText: { color: '#6366f1', fontSize: 13, fontWeight: '700' },
  sectionLabel: {
    color: '#444', fontSize: 11, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1.5, paddingHorizontal: 20, marginBottom: 8, marginTop: 20,
  },
  section: {
    backgroundColor: '#0d0d1e', marginHorizontal: 16, borderRadius: 18,
    borderWidth: 1, borderColor: '#111133', overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 18, paddingVertical: 16, borderBottomWidth: 1, borderColor: '#111133',
  },
  menuLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  menuIcon: { fontSize: 18 },
  menuLabel: { color: '#fff', fontSize: 15, fontWeight: '500' },
  menuValue: { color: '#555', fontSize: 12, marginTop: 2 },
  menuChevron: { color: '#333', fontSize: 22 },
  dangerText: { color: '#ef4444' },
  accountItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 18, paddingVertical: 14,
    borderBottomWidth: 1, borderColor: '#111133',
  },
  accountInfo: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  miniAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  miniAvatarText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  accountText: { flex: 1 },
  accountName: { color: '#fff', fontSize: 14, fontWeight: '600' },
  accountEmail: { color: '#555', fontSize: 12 },
  activeTag: { color: '#10b981', fontSize: 10, fontWeight: '800', backgroundColor: '#10b98122', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  removeBtn: { padding: 8, marginLeft: 8 },
  removeBtnText: { color: '#444', fontSize: 16 },
  addAccountBtn: { padding: 18, alignItems: 'center' },
  addAccountText: { color: '#6366f1', fontSize: 14, fontWeight: '600' },
  footer: { color: '#444', fontSize: 11, textAlign: 'center', marginTop: 40, marginBottom: 40 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: { backgroundColor: '#0d0d1e', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, borderWidth: 1, borderColor: '#1a1a3e' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '800', marginBottom: 24 },
  modalLabel: { color: '#888', fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: '#060611', color: '#fff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#1a1a3e', fontSize: 15 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 28, marginBottom: 8 },
  cancelBtn: { flex: 1, padding: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  confirmBtn: { flex: 2, backgroundColor: '#6366f1', padding: 16, borderRadius: 12, alignItems: 'center' },
  cancelBtnText: { color: '#888', fontWeight: '600' },
  confirmBtnText: { color: '#fff', fontWeight: '700' },
});
