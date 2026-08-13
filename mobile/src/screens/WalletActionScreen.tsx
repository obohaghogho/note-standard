import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, TouchableOpacity,
  ActivityIndicator, Alert, ScrollView, KeyboardAvoidingView, Platform
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import apiClient from '../api/apiClient';
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
  const [depositMethod, setDepositMethod] = useState<'card' | 'bank'>('bank');
  const [supportedDepositRails, setSupportedDepositRails] = useState<string[]>(['bank']);
  const [bankDetails, setBankDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const isDeposit = type === 'deposit';
  const isFiat = ['USD', 'NGN', 'EUR', 'GBP', 'JPY', 'TZS', 'GHS', 'KES', 'ZAR', 'CAD'].includes(currency);

  const [bankList, setBankList] = useState<Array<{ code: string; name: string }>>([]);
  const [bankCode, setBankCode] = useState('');
  const [resolvingAccount, setResolvingAccount] = useState(false);
  const [verifiedName, setVerifiedName] = useState('');

  React.useEffect(() => {
    async function loadCapabilities() {
      try {
        const res = await apiClient.get(`/wallet/capabilities/${currency}`);
        if (res.data && res.data.depositMethods) {
          const rails = res.data.depositMethods.map((r: any) => r.type);
          setSupportedDepositRails(rails);
          if (rails.includes('card')) {
            setDepositMethod('card');
          } else {
            setDepositMethod('bank');
          }
        }
      } catch (e) {
        // Fallback to bank if capability fetch fails
      }
    }

    async function loadBanks() {
      if (currency === 'NGN') {
        try {
          const res = await apiClient.get('/anchor/banks');
          const list = res.data?.banks || res.data?.data || [];
          if (list.length > 0) {
            setBankList(list.map((b: any) => ({ code: b.code || b.bankCode, name: b.name || b.bankName })));
          }
        } catch (e) {
          // Fallback static list for NGN popular banks
          setBankList([
            { code: '058', name: 'GTBank' },
            { code: '057', name: 'Zenith Bank' },
            { code: '011', name: 'First Bank' },
            { code: '033', name: 'United Bank for Africa (UBA)' },
            { code: '044', name: 'Access Bank' },
            { code: '214', name: 'FCMB' },
            { code: '035', name: 'Wema Bank (ALAT)' },
            { code: '50515', name: 'Moniepoint' },
            { code: '999992', name: 'OPay' },
            { code: '50211', name: 'Kuda Bank' },
          ]);
        }
      }
    }

    loadCapabilities();
    loadBanks();
  }, [currency]);

  const resolveAccountName = async (num: string, code: string) => {
    if (num.length === 10 && code) {
      setResolvingAccount(true);
      try {
        const res = await apiClient.post('/anchor/verify-account', { accountNumber: num, bankCode: code });
        const name = res.data?.data?.accountName || res.data?.accountName || res.data?.data?.name;
        if (name) {
          setAccountName(name);
          setVerifiedName(name);
        }
      } catch (err: any) {
        setVerifiedName('');
      } finally {
        setResolvingAccount(false);
      }
    }
  };

  const handleDeposit = async () => {
    if (!amount || isNaN(parseFloat(amount))) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    setLoading(true);
    setBankDetails(null);
    try {
      if (isFiat) {
        const endpoint = depositMethod === 'card' ? '/wallet/deposit/card' : '/wallet/deposit/transfer';
        const res = await apiClient.post(endpoint, { currency, amount: parseFloat(amount) });
        
        if (depositMethod === 'card') {
          const link = res.data?.link || res.data?.checkoutUrl || res.data?.url;
          if (link) {
            Alert.alert(
              'Payment Link Ready',
              'Please complete your payment via our secure checkout page.',
              [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Open Payment Page', onPress: () => {
                  // In a real app, use Linking.openURL(link)
                  // For now, we'll just show it
                  Alert.alert('Checkout URL', link);
                } }
              ]
            );
          } else {
            Alert.alert('Success', 'Deposit initiated. Please check your email for instructions.');
          }
        } else {
          // Bank Transfer
          setBankDetails(res.data?.bankDetails);
          Alert.alert('Bank Details Received', 'Please transfer the exact amount to the bank account shown on screen.');
        }
      } else {
        // Crypto
        const res = await apiClient.post(`/wallet/deposit`, { currency, amount: parseFloat(amount) });
        const address = res.data?.payAddress || res.data?.address;
        if (address) {
          Alert.alert('Deposit Address', `Send ${amount} ${currency} to:\n\n${address}`);
        } else {
          Alert.alert('Deposit Initiated', 'Please check your email for instructions.');
        }
      }
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
      const payload: any = {
        currency,
        amount: parseFloat(amount),
        network: isFiat ? undefined : 'native',
        client_idempotency_key: `wdr_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      };

      if (isFiat) {
        payload.destination = {
          bank_name: bankName,
          account_number: accountNumber,
          account_name: accountName,
          country: currency === 'NGN' ? 'Nigeria' : 'International',
        };
      } else {
        payload.destination = address;
      }

      const res = await apiClient.post(`/wallet/withdraw`, payload);
      if (res.data?.otpRequired) {
        navigation.navigate('WithdrawalOtp', {
          withdrawal_reference: res.data.withdrawal_reference || res.data.reference,
          fincra_reference: res.data.fincra_reference,
          trace_id: res.data.trace_id,
          amount: parseFloat(amount),
          currency,
        });
        return;
      }

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

        {/* Deposit Method Selector (Fiat only) */}
        {isDeposit && isFiat && (
          <View style={styles.methodRow}>
            {supportedDepositRails.includes('card') && (
              <TouchableOpacity 
                style={[styles.methodBtn, depositMethod === 'card' && styles.methodBtnActive]} 
                onPress={() => setDepositMethod('card')}
              >
                <Text style={[styles.methodBtnText, depositMethod === 'card' && styles.methodBtnTextActive]}>💳 Card</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity 
              style={[styles.methodBtn, depositMethod === 'bank' && styles.methodBtnActive]} 
              onPress={() => setDepositMethod('bank')}
            >
              <Text style={[styles.methodBtnText, depositMethod === 'bank' && styles.methodBtnTextActive]}>
                {supportedDepositRails.includes('mobile_money') ? '📱 Mobile Money / Bank' : '🏦 Bank Transfer'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Bank Details Display */}
        {isDeposit && bankDetails && (
          <View style={styles.bankInfoBox}>
            <Text style={styles.infoTitle}>🏦 Transfer Details</Text>
            <View style={styles.bankDetailRow}><Text style={styles.bankLabel}>Bank:</Text><Text style={styles.bankValue}>{bankDetails.bankName}</Text></View>
            <View style={styles.bankDetailRow}><Text style={styles.bankLabel}>Account:</Text><Text style={styles.bankValue}>{bankDetails.accountNumber}</Text></View>
            <View style={styles.bankDetailRow}><Text style={styles.bankLabel}>Name:</Text><Text style={styles.bankValue}>{bankDetails.accountName}</Text></View>
            {bankDetails.reference && (
              <View style={styles.bankDetailRow}><Text style={styles.bankLabel}>Reference:</Text><Text style={styles.bankValue}>{bankDetails.reference}</Text></View>
            )}
            <Text style={styles.bankNote}>⚠️ {bankDetails.note || "Please include the reference in your transfer narration."}</Text>
          </View>
        )}

        {/* Deposit Instructions */}
        {isDeposit && !bankDetails && (
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>ℹ️ How {depositMethod === 'card' ? 'Card' : 'Bank'} Deposits Work</Text>
            <Text style={styles.infoText}>
              {depositMethod === 'card' 
                ? "After tapping Confirm, you'll get a secure payment link to complete your deposit using your debit/credit card."
                : "After tapping Confirm, you'll receive the official bank account details to complete your transfer."
              }
            </Text>
          </View>
        )}

        {/* Withdrawal Fields */}
        {!isDeposit && isFiat && (
          <>
            <Text style={styles.label}>Bank Name</Text>
            {currency === 'NGN' && bankList.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {bankList.map((b) => (
                  <TouchableOpacity
                    key={b.code}
                    style={[
                      { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#1e293b', marginRight: 8, borderWidth: 1, borderColor: '#334155' },
                      bankCode === b.code && { backgroundColor: '#6366f122', borderColor: '#6366f1' }
                    ]}
                    onPress={() => {
                      setBankCode(b.code);
                      setBankName(b.name);
                      if (accountNumber.length === 10) {
                        resolveAccountName(accountNumber, b.code);
                      }
                    }}
                  >
                    <Text style={{ color: bankCode === b.code ? '#818cf8' : '#94a3b8', fontSize: 12, fontWeight: '600' }}>
                      {b.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
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
              placeholder="10-digit account number"
              placeholderTextColor="#444"
              keyboardType="numeric"
              maxLength={10}
              value={accountNumber}
              onChangeText={(val) => {
                setAccountNumber(val);
                if (val.length === 10 && bankCode) {
                  resolveAccountName(val, bankCode);
                }
              }}
            />
            {resolvingAccount && (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <ActivityIndicator size="small" color="#6366f1" />
                <Text style={{ color: '#818cf8', fontSize: 12, marginLeft: 8 }}>Verifying account name via NIP...</Text>
              </View>
            )}
            {verifiedName ? (
              <View style={{ padding: 10, borderRadius: 8, backgroundColor: '#05966922', borderWidth: 1, borderColor: '#10b981', marginBottom: 12 }}>
                <Text style={{ color: '#34d399', fontSize: 12, fontWeight: '700' }}>✅ Account Verified: {verifiedName}</Text>
              </View>
            ) : null}
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
  methodRow: { flexDirection: 'row', gap: 10, marginTop: 24 },
  methodBtn: { 
    flex: 1, padding: 12, borderRadius: 12, backgroundColor: '#0d0d1e', 
    borderWidth: 1, borderColor: '#1a1a3e', alignItems: 'center' 
  },
  methodBtnActive: { backgroundColor: '#6366f122', borderColor: '#6366f1' },
  methodBtnText: { color: '#888', fontSize: 13, fontWeight: '700' },
  methodBtnTextActive: { color: '#6366f1' },
  bankInfoBox: { 
    backgroundColor: '#0d0d1e', borderRadius: 16, padding: 20, marginTop: 24,
    borderWidth: 1, borderColor: '#6366f144'
  },
  bankDetailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  bankLabel: { color: '#666', fontSize: 13 },
  bankValue: { color: '#fff', fontSize: 14, fontWeight: '700' },
  bankNote: { color: '#f59e0b', fontSize: 12, marginTop: 8, lineHeight: 18 },
});
