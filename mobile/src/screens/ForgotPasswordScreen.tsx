import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import apiClient from '../api/apiClient';

export default function ForgotPasswordScreen() {
  const navigation = useNavigation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      Alert.alert('Error', 'Please enter your email address.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiClient.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
      if (res.data.success) {
        setSent(true);
      } else {
        Alert.alert('Error', res.data.error || 'Failed to send reset email.');
      }
    } catch (e: any) {
      console.error('[ForgotPassword] Error:', e);
      const msg = e.response?.data?.error || 'Failed to process request.';
      Alert.alert('Error', msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#060611', '#0d0d1a', '#060611']} style={styles.gradient}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.backText}>← Back to Login</Text>
          </TouchableOpacity>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Reset Password</Text>
            <Text style={styles.cardSubtitle}>
              {sent 
                ? "If an account exists for this email, you'll receive a reset link shortly." 
                : "Enter your email address and we'll send you a link to reset your password."}
            </Text>

            {!sent && (
              <>
                <View style={styles.inputGroup}>
                  <Text style={styles.label}>Email Address</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="you@example.com"
                    placeholderTextColor="#444"
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <TouchableOpacity style={styles.resetBtn} onPress={handleReset} disabled={loading}>
                  <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.resetGrad}>
                    {loading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <Text style={styles.resetBtnText}>Send Reset Link</Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}

            {sent && (
              <TouchableOpacity style={styles.doneBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.doneBtnText}>Back to Sign In</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  flex: { flex: 1 },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  backBtn: { marginBottom: 30 },
  backText: { color: '#6366f1', fontSize: 15, fontWeight: '600' },
  card: {
    backgroundColor: '#111122', borderRadius: 24, padding: 28,
    borderWidth: 1, borderColor: '#1e1e3a',
  },
  cardTitle: { color: '#fff', fontSize: 24, fontWeight: '700', marginBottom: 8 },
  cardSubtitle: { color: '#666', fontSize: 14, marginBottom: 28, lineHeight: 20 },
  inputGroup: { marginBottom: 24 },
  label: { color: '#aaa', fontSize: 13, fontWeight: '600', marginBottom: 8 },
  input: {
    backgroundColor: '#0a0a16', borderWidth: 1, borderColor: '#1e1e3a',
    borderRadius: 14, padding: 16, color: '#fff', fontSize: 15,
  },
  resetBtn: { borderRadius: 14, overflow: 'hidden' },
  resetGrad: { padding: 16, alignItems: 'center' },
  resetBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  doneBtn: { 
    padding: 16, alignItems: 'center', borderRadius: 14, 
    borderWidth: 1, borderColor: '#1e1e3a', marginTop: 8 
  },
  doneBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
