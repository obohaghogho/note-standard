import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import apiClient from '../../api/apiClient';

export default function WithdrawalOtpModal() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();

  const {
    withdrawal_reference,
    fincra_reference,
    trace_id,
    amount,
    currency
  } = route.params || {};

  const [otp, setOtp] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);

  const handleVerify = async () => {
    if (!otp || otp.trim().length < 4) {
      Alert.alert('Invalid Code', 'Please enter the verification code sent to your email/phone.');
      return;
    }

    setVerifying(true);
    try {
      const res = await apiClient.post('/v1/withdrawals/verify-otp', {
        otp: otp.trim(),
        withdrawal_reference,
        fincra_reference,
        trace_id,
      });

      if (res.data && res.data.success) {
        Alert.alert(
          '✅ Withdrawal Confirmed',
          res.data.message || `Your withdrawal of ${amount || ''} ${currency || ''} has been authorized and is processing.`,
          [{ text: 'OK', onPress: () => navigation.popToTop() }]
        );
      } else {
        Alert.alert('Verification Failed', res.data?.message || 'Invalid OTP code. Please try again.');
      }
    } catch (err: any) {
      console.error('[WithdrawalOtpModal] Verification error:', err);
      Alert.alert(
        'Verification Error',
        err.response?.data?.error || err.response?.data?.message || 'Verification failed. Please check the code and try again.'
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      const res = await apiClient.post('/v1/withdrawals/resend-otp', {
        withdrawal_reference,
        fincra_reference,
      });
      Alert.alert('OTP Resent', res.data?.message || 'A new verification code has been sent.');
    } catch (err: any) {
      Alert.alert('Resend Failed', err.response?.data?.error || 'Could not resend OTP at this time.');
    } finally {
      setResending(false);
    }
  };

  return (
    <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.icon}>🔒</Text>
        <Text style={styles.title}>Authorize Withdrawal</Text>
        <Text style={styles.subtitle}>
          Enter the 6-digit security OTP code sent to your registered email to authorize the payout of{' '}
          <Text style={{ color: '#fff', fontWeight: '800' }}>{amount} {currency}</Text>.
        </Text>

        <TextInput
          style={styles.otpInput}
          placeholder="123456"
          placeholderTextColor="#444466"
          keyboardType="number-pad"
          maxLength={6}
          value={otp}
          onChangeText={setOtp}
          autoFocus
        />

        <TouchableOpacity
          style={[styles.verifyBtn, verifying && { opacity: 0.6 }]}
          onPress={handleVerify}
          disabled={verifying}
        >
          {verifying ? <ActivityIndicator color="#fff" /> : <Text style={styles.verifyBtnText}>Verify & Authorize</Text>}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resendBtn}
          onPress={handleResend}
          disabled={resending}
        >
          <Text style={styles.resendText}>
            {resending ? 'Resending...' : "Didn't receive code? Resend OTP"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
          <Text style={styles.cancelText}>Cancel Withdrawal</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 20 },
  card: {
    backgroundColor: '#111122', borderRadius: 24, padding: 28, borderWidth: 1,
    borderColor: '#222244', alignItems: 'center'
  },
  icon: { fontSize: 44, marginBottom: 12 },
  title: { color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 8 },
  subtitle: { color: '#8888aa', fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  otpInput: {
    backgroundColor: '#060611', borderRadius: 16, borderWidth: 2, borderColor: '#6366f1',
    color: '#fff', fontSize: 32, fontWeight: '900', letterSpacing: 10, textAlign: 'center',
    width: '100%', paddingVertical: 14, marginBottom: 24
  },
  verifyBtn: {
    backgroundColor: '#6366f1', width: '100%', paddingVertical: 16, borderRadius: 14,
    alignItems: 'center', marginBottom: 16
  },
  verifyBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  resendBtn: { paddingVertical: 8 },
  resendText: { color: '#818cf8', fontSize: 13, fontWeight: '600' },
  cancelBtn: { marginTop: 12, paddingVertical: 8 },
  cancelText: { color: '#ef4444', fontSize: 13, fontWeight: '600' }
});
