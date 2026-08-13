import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import apiClient from '../../api/apiClient';

export default function TransferScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const initialCurrency = route.params?.currency || 'USD';

  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(initialCurrency);
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [transferFee, setTransferFee] = useState<number>(0);
  const [recipientValid, setRecipientValid] = useState<boolean | null>(null);

  const currencies = ['USD', 'NGN', 'EUR', 'GBP', 'USDT'];

  const validateRecipient = async (val: string) => {
    if (!val || val.length < 3) {
      setRecipientValid(null);
      return;
    }
    try {
      const cleanVal = val.startsWith('@') ? val.substring(1) : val;
      const res = await apiClient.get(`/chat/friends?search=${encodeURIComponent(cleanVal)}`);
      const list = res.data || [];
      if (list.length > 0 || val.includes('@')) {
        setRecipientValid(true);
      } else {
        setRecipientValid(false);
      }
    } catch {
      setRecipientValid(null);
    }
  };

  const handleTransfer = async () => {
    if (!recipient.trim()) {
      Alert.alert('Error', 'Please enter recipient username or email');
      return;
    }

    const numAmount = parseFloat(amount);
    if (!amount || isNaN(numAmount) || numAmount <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      const cleanRecipient = recipient.startsWith('@') ? recipient.substring(1) : recipient;
      const isEmail = cleanRecipient.includes('@');

      const payload = {
        recipient_username: isEmail ? undefined : cleanRecipient,
        recipient_email: isEmail ? cleanRecipient : undefined,
        amount: numAmount,
        currency,
        description: description.trim() || undefined,
      };

      const res = await apiClient.post('/wallet/transfer', payload);

      if (res.data && (res.data.success || res.data.transactionId)) {
        Alert.alert(
          '✅ Transfer Successful',
          `Successfully sent ${numAmount} ${currency} to ${recipient}.\nTransaction ID: ${res.data.transactionId || 'Completed'}`,
          [{ text: 'Done', onPress: () => navigation.goBack() }]
        );
      } else {
        Alert.alert('Transfer Failed', res.data?.message || 'Transaction could not be completed');
      }
    } catch (err: any) {
      console.error('[TransferScreen] Error:', err);
      Alert.alert(
        'Transfer Failed',
        err.response?.data?.error || err.response?.data?.message || 'Transfer failed. Please check balance and details.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Send Money P2P</Text>
          <View style={{ width: 50 }} />
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {/* Currency Selector */}
          <Text style={styles.label}>Select Currency</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyRow}>
            {currencies.map(c => (
              <TouchableOpacity
                key={c}
                style={[styles.currChip, currency === c && styles.currChipActive]}
                onPress={() => setCurrency(c)}
              >
                <Text style={[styles.currText, currency === c && styles.currTextActive]}>{c}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Recipient Input */}
          <Text style={styles.label}>Recipient (@username or email)</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.input}
              placeholder="e.g. @john_doe or john@example.com"
              placeholderTextColor="#555577"
              value={recipient}
              onChangeText={val => {
                setRecipient(val);
                validateRecipient(val);
              }}
              autoCapitalize="none"
            />
            {recipientValid === true && <Text style={styles.validCheck}>✓ Valid</Text>}
          </View>

          {/* Amount Input */}
          <Text style={styles.label}>Amount ({currency})</Text>
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.amountInput}
              placeholder="0.00"
              placeholderTextColor="#555577"
              keyboardType="numeric"
              value={amount}
              onChangeText={setAmount}
            />
            <Text style={styles.currencySuffix}>{currency}</Text>
          </View>

          {/* Description Input */}
          <Text style={styles.label}>Note / Description (Optional)</Text>
          <TextInput
            style={[styles.input, { marginBottom: 24 }]}
            placeholder="What is this for?"
            placeholderTextColor="#555577"
            value={description}
            onChangeText={setDescription}
          />

          {/* Summary Box */}
          <View style={styles.summaryBox}>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Transfer Amount</Text>
              <Text style={styles.summaryValue}>{amount || '0.00'} {currency}</Text>
            </View>
            <View style={styles.summaryRow}>
              <Text style={styles.summaryLabel}>Estimated Fee</Text>
              <Text style={styles.summaryValue}>Free (Instant Internal)</Text>
            </View>
            <View style={[styles.summaryRow, { borderTopWidth: 1, borderTopColor: '#222244', paddingTop: 10, marginTop: 4 }]}>
              <Text style={styles.totalLabel}>Total Deducted</Text>
              <Text style={styles.totalValue}>{amount || '0.00'} {currency}</Text>
            </View>
          </View>

          {/* Submit Button */}
          <TouchableOpacity
            style={[styles.submitBtn, loading && { opacity: 0.6 }]}
            onPress={handleTransfer}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitBtnText}>Confirm & Transfer Now</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  label: { color: '#8888aa', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.5 },
  currencyRow: { flexDirection: 'row', marginBottom: 20 },
  currChip: {
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12, backgroundColor: '#111122',
    borderWidth: 1, borderColor: '#222244', marginRight: 10
  },
  currChipActive: { backgroundColor: '#6366f1', borderColor: '#818cf8' },
  currText: { color: '#888', fontSize: 14, fontWeight: '700' },
  currTextActive: { color: '#fff' },
  inputContainer: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#111122',
    borderRadius: 14, borderWidth: 1, borderColor: '#222244', paddingHorizontal: 16, marginBottom: 20
  },
  input: { flex: 1, color: '#fff', fontSize: 15, paddingVertical: 14 },
  amountInput: { flex: 1, color: '#fff', fontSize: 24, fontWeight: '800', paddingVertical: 14 },
  currencySuffix: { color: '#6366f1', fontSize: 16, fontWeight: '800', marginLeft: 8 },
  validCheck: { color: '#10b981', fontSize: 12, fontWeight: '700', marginLeft: 8 },
  summaryBox: {
    backgroundColor: '#111122', borderRadius: 16, padding: 18, borderWidth: 1,
    borderColor: '#222244', marginBottom: 28
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  summaryLabel: { color: '#888', fontSize: 13 },
  summaryValue: { color: '#fff', fontSize: 14, fontWeight: '700' },
  totalLabel: { color: '#fff', fontSize: 14, fontWeight: '800' },
  totalValue: { color: '#10b981', fontSize: 16, fontWeight: '800' },
  submitBtn: {
    backgroundColor: '#6366f1', paddingVertical: 16, borderRadius: 14, alignItems: 'center',
    shadowColor: '#6366f1', shadowOpacity: 0.4, shadowRadius: 10, elevation: 5
  },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
