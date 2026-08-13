import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../../api/supabase';

export default function SecuritySettingsScreen() {
  const navigation = useNavigation<any>();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updating, setUpdating] = useState(false);

  const handlePasswordChange = async () => {
    if (!newPassword || newPassword.length < 6) {
      Alert.alert('Short Password', 'New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Mismatch', 'New password and confirm password do not match.');
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        Alert.alert('Update Failed', error.message);
      } else {
        Alert.alert('✅ Password Updated', 'Your security password has been updated successfully.');
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Could not update password');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Security & Account</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>🔒 Change Password</Text>
          <Text style={styles.cardDesc}>Ensure your account is using a strong, unique password.</Text>

          <Text style={styles.label}>New Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#555"
            secureTextEntry
            value={newPassword}
            onChangeText={setNewPassword}
          />

          <Text style={styles.label}>Confirm New Password</Text>
          <TextInput
            style={styles.input}
            placeholder="••••••••"
            placeholderTextColor="#555"
            secureTextEntry
            value={confirmPassword}
            onChangeText={setConfirmPassword}
          />

          <TouchableOpacity
            style={[styles.submitBtn, updating && { opacity: 0.6 }]}
            onPress={handlePasswordChange}
            disabled={updating}
          >
            {updating ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitBtnText}>Update Password</Text>}
          </TouchableOpacity>
        </View>

        <View style={[styles.card, { marginTop: 20 }]}>
          <Text style={styles.cardTitle}>🛡️ Security Status</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Session Authentication</Text>
            <Text style={styles.statusActive}>Active & Encrypted</Text>
          </View>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Biometrics / PIN</Text>
            <Text style={styles.statusActive}>Device Handled</Text>
          </View>
        </View>
      </ScrollView>
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
  content: { padding: 20 },
  card: { backgroundColor: '#111122', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#222244' },
  cardTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 4 },
  cardDesc: { color: '#888', fontSize: 13, marginBottom: 20 },
  label: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 6 },
  input: {
    backgroundColor: '#060611', color: '#fff', borderRadius: 12, borderWidth: 1,
    borderColor: '#222244', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, fontSize: 15
  },
  submitBtn: { backgroundColor: '#6366f1', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  submitBtnText: { color: '#fff', fontSize: 15, fontWeight: '800' },
  statusRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#222244' },
  statusLabel: { color: '#888', fontSize: 13 },
  statusActive: { color: '#10b981', fontSize: 13, fontWeight: '700' }
});
