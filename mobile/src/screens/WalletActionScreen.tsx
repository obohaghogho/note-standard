import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, Modal
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import axios from 'axios';
import { AuthService } from '../services/AuthService';
import { API_URL } from '../Config';
import { LinearGradient } from 'expo-linear-gradient';

export default function WalletActionScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const { type, currency } = route.params || { type: 'deposit', currency: 'USD' };

  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [accountName, setAccountName] = useState('');

  const isDeposit = type === 'deposit';

  const handleAction = async () => {
    if (!amount || isNaN(parseFloat(amount))) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    setLoading(true);
    try {
      const token = await AuthService.getToken();
      const headers = { Authorization: `Bearer ${token}` };

      if (isDeposit) {
         // In a real app, this might open a webview or return a link
         Alert.alert('Deposit', 'To complete your deposit, please use the web platform for secure payment processing. Your wallet address is being generated.');
         // We could potentially integrate Fincra/Paystack here if we had the keys/SDKs.
      } else {
        // Withdraw
        const payload = {
          currency,
          amount: parseFloat(amount),
          address: currency !== 'USD' && currency !== 'NGN' ? address : undefined,
          bank_name: (currency === 'USD' || currency === 'NGN') ? bankName : undefined,
          account_number: (currency === 'USD' || currency === 'NGN') ? accountNumber : undefined,
          account_name: (currency === 'USD' || currency === 'NGN') ? accountName : undefined,
        };

        const res = await axios.post(`${API_URL}/api/wallet/withdraw`, payload, { headers });
        Alert.alert('Success', 'Withdrawal request submitted successfully!');
        navigation.goBack();
      }
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Action failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={styles.backBtn}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{isDeposit ? 'Deposit' : 'Withdraw'} {currency}</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Amount to {isDeposit ? 'Deposit' : 'Withdraw'}</Text>
        <View style={styles.inputWrap}>
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

        {!isDeposit && (
          <>
            {currency === 'USD' || currency === 'NGN' ? (
              <View style={{ marginTop: 20 }}>
                <Text style={styles.label}>Bank Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Chase or GTBank"
                  placeholderTextColor="#444"
                  value={bankName}
                  onChangeText={setBankName}
                />
                <Text style={styles.label}>Account Number</Text>
                <TextInput
                  style={styles.input}
                  placeholder="1234567890"
                  placeholderTextColor="#444"
                  keyboardType="numeric"
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                />
                <Text style={styles.label}>Account Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Your Full Name"
                  placeholderTextColor="#444"
                  value={accountName}
                  onChangeText={setAccountName}
                />
              </View>
            ) : (
              <View style={{ marginTop: 20 }}>
                <Text style={styles.label}>Destination Address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0x... or Wallet ID"
                  placeholderTextColor="#444"
                  value={address}
                  onChangeText={setAddress}
                />
              </View>
            )}
          </>
        )}

        <TouchableOpacity 
          style={[styles.mainBtn, { backgroundColor: isDeposit ? '#10b981' : '#6366f1' }]} 
          onPress={handleAction}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.mainBtnText}>Confirm {isDeposit ? 'Deposit' : 'Withdraw'}</Text>
          )}
        </TouchableOpacity>
        
        <Text style={styles.hint}>
          {isDeposit 
            ? 'Deposits are processed instantly via our secure gateway.' 
            : 'Withdrawals may take 1-24 hours to process depending on the network.'}
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  content: { paddingBottom: 40 },
  header: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingTop: 60, 
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderColor: '#111133'
  },
  backBtn: { color: '#666', fontSize: 24, padding: 4 },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  card: { padding: 20 },
  label: { color: '#666', fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginBottom: 8, marginTop: 16 },
  inputWrap: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    backgroundColor: '#0d0d1e', 
    borderRadius: 16, 
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#111133'
  },
  amountInput: { flex: 1, color: '#fff', fontSize: 24, fontWeight: '800', paddingVertical: 16 },
  currencySuffix: { color: '#6366f1', fontSize: 16, fontWeight: '800' },
  input: { 
    backgroundColor: '#0d0d1e', 
    color: '#fff', 
    padding: 16, 
    borderRadius: 12, 
    borderWidth: 1, 
    borderColor: '#111133',
    marginBottom: 12
  },
  mainBtn: { 
    marginTop: 32, 
    padding: 18, 
    borderRadius: 16, 
    alignItems: 'center',
    shadowColor: '#6366f1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 8
  },
  mainBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  hint: { color: '#444', fontSize: 12, textAlign: 'center', marginTop: 20, lineHeight: 18 },
});
