import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, Modal, TextInput, ActivityIndicator, GestureResponderEvent
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../context/AuthContext';
import apiClient from '../api/apiClient';
import { useNavigation } from '@react-navigation/native';

import { LanguageSettingsModal } from './settings/LanguageSettingsModal';

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
  const [showLangModal, setShowLangModal] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [updatingPassword, setUpdatingPassword] = useState(false);
  const navigation = useNavigation<any>();

  const name = user?.full_name || user?.username || 'User';
  const email = user?.email || '';
  const plan = user?.plan_tier || 'FREE';
  const lang = (user?.preferred_language || 'en').toUpperCase();
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
      <Text style={styles.sectionLabel}>Account & Profile Settings</Text>
      <View style={styles.section}>
        <MenuItem icon="👑" label="Subscription Plans & Billing" value={user?.is_pro ? 'Pro Tier Active' : 'Free Tier'} onPress={() => navigation.navigate('SubscriptionPlans')} />
        <MenuItem icon="📢" label="Advertiser & Campaign Portal" value="Auction, CPC & Ads" onPress={() => navigation.navigate('AdsDashboard')} />
        <MenuItem icon="🎁" label="Affiliate & Referral Program" value="Earn lifetime rewards" onPress={() => navigation.navigate('Affiliate')} />
        <MenuItem icon="🛡️" label="Identity Verification (KYC)" value={`Tier ${user?.kyc_level || 0} Active`} onPress={() => navigation.navigate('KycVerification')} />
        <MenuItem icon="✏️" label="Edit Profile & Photos" value="Avatar, Cover, Bio, Phone" onPress={() => navigation.navigate('ProfileEdit')} />
        <MenuItem icon="🌐" label="Language / Locale" value={lang} onPress={() => setShowLangModal(true)} />
        <MenuItem icon="👤" label="Full Name" value={name} />
        <MenuItem icon="📧" label="Email" value={email} />
        <MenuItem icon="🔒" label="Security & Password" onPress={() => navigation.navigate('SecuritySettings')} />
        <MenuItem icon="💳" label="Saved Payout Accounts" onPress={() => navigation.navigate('BankAccounts')} />
      </View>

      {/* Multi-Account Management */}
      <Text style={styles.sectionLabel}>Switch Account</Text>
      <View style={styles.section}>
        {accounts.map(acc => {
          const isActiveAcc = acc.id === user?.id;

          const handleForgetAccount = () => {
            Alert.alert(
              'Forget Account',
              `Remove ${acc.full_name || acc.username} (${acc.email}) from this device? You can log back in anytime.`,
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Forget Account',
                  style: 'destructive',
                  onPress: () => removeAccount(acc.id),
                },
              ],
            );
          };

          const handleAccountMenu = () => {
            const planTier = ((acc as any).profile?.plan_tier || 'FREE').toUpperCase();
            const tokenStatus = acc.tokenState ? acc.tokenState.toUpperCase() : (acc.token ? 'VALID' : 'STALE');
            const sessionMeta = acc.sessionId ? `${acc.sessionId.substring(0, 8)}...` : 'Active';
            const deviceMeta = acc.deviceId ? `${acc.deviceId.substring(0, 8)}...` : 'Current Hardware';

            Alert.alert(
              acc.full_name || acc.username,
              `@${acc.username || 'user'} • ${acc.email}`,
              [
                isActiveAcc ? {
                  text: '✓ Current Account',
                  onPress: () => Alert.alert('Current Account', `You are currently logged in as ${acc.email}.`),
                } : {
                  text: 'Switch Account',
                  onPress: () => switchAccount(acc.id),
                },
                {
                  text: 'View Profile',
                  onPress: () => {
                    Alert.alert(
                      'Profile Details',
                      `Name: ${acc.full_name || 'N/A'}\nUsername: @${acc.username || 'user'}\nEmail: ${acc.email}\nPlan Tier: ${planTier}`,
                      [{ text: 'OK' }]
                    );
                  },
                },
                {
                  text: 'Manage Session',
                  onPress: () => {
                    Alert.alert(
                      'Session Health',
                      `Session ID: ${sessionMeta}\nDevice ID: ${deviceMeta}\nToken Status: ${tokenStatus}\nLast Active: ${acc.lastActive ? new Date(acc.lastActive).toLocaleString() : 'Just now'}`,
                      [{ text: 'OK' }]
                    );
                  },
                },
                {
                  text: 'Forget Account',
                  style: 'destructive',
                  onPress: handleForgetAccount,
                },
                { text: 'Cancel', style: 'cancel' },
              ]
            );
          };

          return (
            <View key={acc.id} style={styles.accountItem}>
              <TouchableOpacity
                style={styles.accountInfo}
                onPress={() => !isActiveAcc && switchAccount(acc.id)}
                onLongPress={handleAccountMenu}
                delayLongPress={500}
                activeOpacity={isActiveAcc ? 0.9 : 0.7}
              >
                <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.miniAvatar}>
                  <Text style={styles.miniAvatarText}>{acc.full_name?.charAt(0) || acc.username.charAt(0)}</Text>
                </LinearGradient>
                <View style={styles.accountText}>
                  <Text style={styles.accountName}>{acc.full_name || acc.username}</Text>
                  <Text style={styles.accountEmail}>{acc.email}</Text>
                  <Text style={styles.accountHint}>
                    {isActiveAcc ? 'Active Account • Tap ⋮ for options' : 'Tap to switch • Hold or tap ⋮ for options'}
                  </Text>
                </View>
                {isActiveAcc && <Text style={styles.activeTag}>Active</Text>}
              </TouchableOpacity>

              <TouchableOpacity
                onPress={(e: GestureResponderEvent) => {
                  e.stopPropagation();
                  handleAccountMenu();
                }}
                style={styles.removeBtn}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={`Options for ${acc.full_name || acc.username}`}
                accessibilityRole="button"
              >
                <Text style={styles.menuDotsText}>⋮</Text>
              </TouchableOpacity>
            </View>
          );
        })}
        <TouchableOpacity style={styles.addAccountBtn} onPress={addAccount}>
          <Text style={styles.addAccountText}>+ Add another account</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionLabel}>Preferences & Activity</Text>
      <View style={styles.section}>
        <MenuItem
          icon="🔔"
          label="Notifications Center"
          value="View All"
          onPress={() => navigation.navigate('Notifications')}
        />
        <MenuItem
          icon="🔍"
          label="Global Search"
          value="Notes, Chats, Teams"
          onPress={() => navigation.navigate('Search')}
        />
        <MenuItem
          icon="🎨"
          label="Appearance"
          value="Dark Mode (Crystal)"
          onPress={() => Alert.alert('Appearance', 'Optimized dark mode active')}
        />
        <MenuItem icon="📱" label="App Version" value="1.4.2" />
      </View>

      <Text style={styles.sectionLabel}>Support & Feedback</Text>
      <View style={styles.section}>
        <MenuItem icon="💬" label="Support Chat" onPress={handleSupport} />
        <MenuItem icon="🐛" label="Submit Bug / Feedback" onPress={() => navigation.navigate('UserIssueTracker')} />
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

      {/* Language Settings Modal */}
      <LanguageSettingsModal
        visible={showLangModal}
        onClose={() => setShowLangModal(false)}
      />
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
  accountHint: { color: '#333', fontSize: 10, marginTop: 2 },
  activeTag: { color: '#10b981', fontSize: 10, fontWeight: '800', backgroundColor: '#10b98122', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  removeBtn: { padding: 10, marginLeft: 8 },
  removeBtnText: { color: '#333', fontSize: 14 },
  menuDotsText: { color: '#888', fontSize: 18, fontWeight: '700', paddingHorizontal: 4 },
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
