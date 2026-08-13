import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  TextInput, ScrollView, Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import apiClient from '../../api/apiClient';

interface BankAccount {
  currency: string;
  account_holder: string;
  account_number: string;
  bank_name: string;
  iban_last4?: string;
  settlement_info?: string;
}

export default function BankAccountsScreen() {
  const navigation = useNavigation<any>();
  const [selectedCurrency, setSelectedCurrency] = useState('USD');
  const [account, setAccount] = useState<BankAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    account_holder: '',
    account_number: '',
    bank_name: '',
    bank_address: 'Main Branch',
    iban: '',
    swift_code: '',
  });

  const currencies = ['USD', 'EUR', 'GBP', 'NGN'];

  const fetchBankAccount = async (curr: string) => {
    setLoading(true);
    setAccount(null);
    try {
      const res = await apiClient.get('/bank-account', { params: { currency: curr } });
      if (res.data && res.data.found !== false && res.data.account_number) {
        setAccount(res.data);
      } else {
        setAccount(null);
      }
    } catch (e) {
      setAccount(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBankAccount(selectedCurrency);
  }, [selectedCurrency]);

  const handleSave = async () => {
    if (!formData.account_holder || !formData.account_number || !formData.bank_name) {
      Alert.alert('Missing Details', 'Please fill in account holder, account number, and bank name.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.post('/bank-account', {
        ...formData,
        currency: selectedCurrency,
      });

      if (res.data) {
        Alert.alert('✅ Saved', `Your ${selectedCurrency} bank account has been saved for payouts.`);
        setShowAddForm(false);
        fetchBankAccount(selectedCurrency);
      }
    } catch (err: any) {
      Alert.alert('Save Failed', err.response?.data?.error || 'Could not save bank account.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saved Payout Accounts</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Currency Switcher */}
        <View style={styles.currencyRow}>
          {currencies.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.chip, selectedCurrency === c && styles.chipActive]}
              onPress={() => { setSelectedCurrency(c); setShowAddForm(false); }}
            >
              <Text style={[styles.chipText, selectedCurrency === c && styles.chipTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#6366f1" />
          </View>
        ) : showAddForm ? (
          <View style={styles.formCard}>
            <Text style={styles.formTitle}>Add {selectedCurrency} Payout Account</Text>

            <Text style={styles.inputLabel}>Account Holder Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. John Doe"
              placeholderTextColor="#555"
              value={formData.account_holder}
              onChangeText={val => setFormData({ ...formData, account_holder: val })}
            />

            <Text style={styles.inputLabel}>Account / NUBAN Number</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1234567890"
              placeholderTextColor="#555"
              keyboardType="number-pad"
              value={formData.account_number}
              onChangeText={val => setFormData({ ...formData, account_number: val })}
            />

            <Text style={styles.inputLabel}>Bank Name</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Zenith Bank / Chase"
              placeholderTextColor="#555"
              value={formData.bank_name}
              onChangeText={val => setFormData({ ...formData, bank_name: val })}
            />

            {selectedCurrency !== 'NGN' && (
              <>
                <Text style={styles.inputLabel}>IBAN (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="GB82 WEST 1234 5698 7654 32"
                  placeholderTextColor="#555"
                  value={formData.iban}
                  onChangeText={val => setFormData({ ...formData, iban: val })}
                />

                <Text style={styles.inputLabel}>SWIFT / BIC Code (Optional)</Text>
                <TextInput
                  style={styles.input}
                  placeholder="CHASUS33XXX"
                  placeholderTextColor="#555"
                  value={formData.swift_code}
                  onChangeText={val => setFormData({ ...formData, swift_code: val })}
                />
              </>
            )}

            <View style={styles.formButtons}>
              <TouchableOpacity style={styles.cancelFormBtn} onPress={() => setShowAddForm(false)}>
                <Text style={styles.cancelFormText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveFormBtn, submitting && { opacity: 0.6 }]}
                onPress={handleSave}
                disabled={submitting}
              >
                {submitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveFormText}>Save Account</Text>}
              </TouchableOpacity>
            </View>
          </View>
        ) : account ? (
          <View style={styles.accountCard}>
            <View style={styles.accountHeader}>
              <Text style={styles.bankName}>{account.bank_name}</Text>
              <Text style={styles.currencyBadge}>{account.currency}</Text>
            </View>

            <View style={styles.accountRow}>
              <Text style={styles.rowLabel}>Account Holder</Text>
              <Text style={styles.rowValue}>{account.account_holder}</Text>
            </View>

            <View style={styles.accountRow}>
              <Text style={styles.rowLabel}>Account Number</Text>
              <Text style={styles.rowValueHighlight}>{account.account_number}</Text>
            </View>

            {account.iban_last4 && (
              <View style={styles.accountRow}>
                <Text style={styles.rowLabel}>IBAN Ending</Text>
                <Text style={styles.rowValue}>•••• {account.iban_last4}</Text>
              </View>
            )}

            <TouchableOpacity style={styles.editBtn} onPress={() => setShowAddForm(true)}>
              <Text style={styles.editText}>Update Account Details</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🏦</Text>
            <Text style={styles.emptyTitle}>No {selectedCurrency} Payout Account Saved</Text>
            <Text style={styles.emptyText}>
              Save your local bank account details to enable 1-click fiat withdrawals.
            </Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddForm(true)}>
              <Text style={styles.addBtnText}>+ Add {selectedCurrency} Bank Account</Text>
            </TouchableOpacity>
          </View>
        )}
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
  currencyRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  chip: {
    flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#111122',
    borderWidth: 1, borderColor: '#222244', alignItems: 'center'
  },
  chipActive: { backgroundColor: '#6366f1', borderColor: '#818cf8' },
  chipText: { color: '#888', fontSize: 14, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  centerContainer: { padding: 40, alignItems: 'center' },
  accountCard: {
    backgroundColor: '#111122', borderRadius: 20, padding: 20, borderWidth: 1,
    borderColor: '#222244'
  },
  accountHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  bankName: { color: '#fff', fontSize: 20, fontWeight: '800' },
  currencyBadge: { backgroundColor: '#6366f1', color: '#fff', fontSize: 12, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  accountRow: { marginBottom: 12 },
  rowLabel: { color: '#888', fontSize: 12, fontWeight: '600', marginBottom: 2 },
  rowValue: { color: '#fff', fontSize: 16, fontWeight: '700' },
  rowValueHighlight: { color: '#38bdf8', fontSize: 20, fontWeight: '800' },
  editBtn: { marginTop: 12, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#222244', alignItems: 'center' },
  editText: { color: '#818cf8', fontSize: 14, fontWeight: '700' },
  emptyContainer: { padding: 30, alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  emptyText: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  addBtn: { backgroundColor: '#6366f1', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14 },
  addBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  formCard: { backgroundColor: '#111122', borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#222244' },
  formTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 18 },
  inputLabel: { color: '#888', fontSize: 12, fontWeight: '700', marginBottom: 6, textTransform: 'uppercase' },
  input: { backgroundColor: '#060611', color: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#222244', paddingHorizontal: 14, paddingVertical: 12, marginBottom: 16, fontSize: 14 },
  formButtons: { flexDirection: 'row', gap: 12, marginTop: 8 },
  cancelFormBtn: { flex: 1, backgroundColor: '#222244', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  cancelFormText: { color: '#888', fontSize: 14, fontWeight: '700' },
  saveFormBtn: { flex: 1, backgroundColor: '#6366f1', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveFormText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
