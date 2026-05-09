import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import axios from 'axios';
import { AuthService } from '../services/AuthService';
import { API_URL } from '../Config';
import { LinearGradient } from 'expo-linear-gradient';

export default function WalletActionScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { type, currency } = route.params || { type: 'deposit', currency: 'USD' };

  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');
  const [loading, setLoading] = useState(false);

  const isDeposit = type === 'deposit';
  const isFiat = ['USD', 'NGN', 'EUR', 'GBP'].includes(currency);

  const getHeaders = async () => {
    const token = await AuthService.getToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-client-type': 'mobile', // bypass reCAPTCHA
    };
  };

  const handleDeposit = async () => {
    if (!amount || isNaN(parseFloat(amount))) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    setLoading(true);
    try {
      const headers = await getHeaders();
      const res = await axios.post(
        `${API_URL}/api/wallet/deposit`,
        { currency, amount: parseFloat(amount) },
        { headers }
      );
      Alert.alert(
        'Deposit Initiated',
        res.data?.message || `To deposit ${amount} ${currency}, please follow the instructions sent to your email or use the payment link.`,
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Failed to initiate deposit');
    } finally {
      setLoading(false);
    }
  };

  const handleWithdraw = async () => {
    if (!amount || isNaN(parseFloat(amount))) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    if (isFiat && (!bankName || !accountNumber || !accountName)) {
      Alert.alert('Error', 'Please fill in all bank details');
      return;
    }

    if (!isFiat && !address) {
      Alert.alert('Error', 'Please enter your wallet address');
      return;
    }

    setLoading(true);
    try {
      const headers = await getHeaders();
      const payload: any = {
        currency,
        amount: parseFloat(amount),
        network: isFiat ? undefined : 'native',
      };

      if (isFiat) {
        payload.bank_name = bankName;
        payload.account_number = accountNumber;
        payload.account_name = accountName;
        payload.country = currency === 'NGN' ? 'Nigeria' : 'International';
      } else {
        payload.address = address;
      }

      const res = await axios.post(`${API_URL}/api/wallet/withdraw`, payload, { headers });
      Alert.alert(
        '✅ Withdrawal Submitted',
        res.data?.message || 'Your withdrawal request has been submitted and will be processed within 1-24 hours.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Withdrawal failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isDeposit ? 'Deposit' : 'Withdraw'} {currency}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.content} contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Amount */}
        <Text style={styles.label}>Amount ({currency})</Text>
        <View style={styles.amountWrap}>
          <TextInput
            style={styles.amountInput}
            placeholder="0.00"
            placeholderTextColor="#444"
            keyboardType="numeric"
            value={amount}
            onChangeText={setAmount}
          />
          <Text style={styles.currencySuffix}>{currency}</Text>
        </View>

        {/* Deposit Instructions */}
        {isDeposit && (
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>ℹ️ How Deposits Work</Text>
            <Text style={styles.infoText}>
              After tapping Confirm, a deposit request will be created. You'll receive payment instructions via your registered email, or you can use the web platform for immediate payment processing.
            </Text>
          </View>
        )}

        {/* Withdrawal Fields */}
        {!isDeposit && isFiat && (
          <>
            <Text style={styles.label}>Bank Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. GTBank, Chase, Barclays"
              placeholderTextColor="#444"
              value={bankName}
              onChangeText={setBankName}
            />
            <Text style={styles.label}>Account Number / IBAN</Text>
            <TextInput
              style={styles.input}
              placeholder="Your account number"
              placeholderTextColor="#444"
              keyboardType="numeric"
              value={accountNumber}
              onChangeText={setAccountNumber}
            />
            <Text style={styles.label}>Account Holder Name</Text>
            <TextInput
              style={styles.input}
              placeholder="Full name on account"
              placeholderTextColor="#444"
              value={accountName}
              onChangeText={setAccountName}
            />
          </>
        )}

        {!isDeposit && !isFiat && (
          <>
            <View style={styles.warningBox}>
              <Text style={styles.warningText}>⚠️ Warning: Send only {currency} to this address. Sending other tokens will result in permanent loss.</Text>
            </View>
            <Text style={styles.label}>Destination Wallet Address</Text>
            <TextInput
              style={styles.input}
              placeholder="0x... or wallet address"
              placeholderTextColor="#444"
              value={address}
              onChangeText={setAddress}
              autoCapitalize="none"
            />
          </>
        )}

        <TouchableOpacity
          style={[styles.mainBtn, isDeposit ? styles.depositBtn : styles.withdrawBtn]}
          onPress={isDeposit ? handleDeposit : handleWithdraw}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.mainBtnText}>
                {isDeposit ? `Deposit ${currency}` : `Submit Withdrawal`}
              </Text>
          }
        </TouchableOpacity>

        <Text style={styles.hint}>
          {isDeposit
            ? 'Deposits are typically processed within a few minutes.'
            : 'Withdrawals are reviewed and processed within 1-24 hours.'}
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 20,
    borderBottomWidth: 1, borderColor: '#111133',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backBtnText: { color: '#888', fontSize: 22 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '700' },
  content: { flex: 1, padding: 20 },
  label: { color: '#888', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, marginTop: 20 },
  amountWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d1e',
    borderRadius: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: '#1a1a3e',
  },
  amountInput: { flex: 1, color: '#fff', fontSize: 28, fontWeight: '800', paddingVertical: 16 },
  currencySuffix: { color: '#6366f1', fontSize: 16, fontWeight: '800' },
  input: {
    backgroundColor: '#0d0d1e', color: '#fff', padding: 16,
    borderRadius: 12, borderWidth: 1, borderColor: '#1a1a3e', fontSize: 15,
  },
  infoBox: {
    backgroundColor: '#1a1a3e', borderRadius: 14, padding: 16, marginTop: 20,
    borderWidth: 1, borderColor: '#2a2a5e',
  },
  infoTitle: { color: '#6366f1', fontWeight: '700', marginBottom: 8 },
  infoText: { color: '#888', fontSize: 13, lineHeight: 20 },
  warningBox: {
    backgroundColor: '#2a1515', borderRadius: 14, padding: 16, marginTop: 20,
    borderWidth: 1, borderColor: '#5a2020',
  },
  warningText: { color: '#ef4444', fontSize: 13, lineHeight: 20 },
  mainBtn: {
    marginTop: 32, padding: 18, borderRadius: 16, alignItems: 'center',
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 8,
  },
  depositBtn: { backgroundColor: '#10b981', shadowColor: '#10b981' },
  withdrawBtn: { backgroundColor: '#6366f1', shadowColor: '#6366f1' },
  mainBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  hint: { color: '#444', fontSize: 12, textAlign: 'center', marginTop: 16, lineHeight: 18 },
});
