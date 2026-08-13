import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  ScrollView, Alert, Clipboard
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation, useRoute } from '@react-navigation/native';
import apiClient from '../../api/apiClient';

interface VirtualAccountData {
  account_number: string;
  bank_name: string;
  account_name: string;
  currency: string;
  iban?: string;
  swift_code?: string;
  routing_number?: string;
  reference?: string;
  expires_at?: string;
}

export default function VirtualAccountModal() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const initialCurrency = route.params?.currency || 'NGN';

  const [selectedCurrency, setSelectedCurrency] = useState<string>(initialCurrency);
  const [loading, setLoading] = useState<boolean>(true);
  const [accountData, setAccountData] = useState<VirtualAccountData | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const currencies = ['NGN', 'USD', 'EUR', 'GBP'];

  const fetchVirtualAccount = async (curr: string) => {
    setLoading(true);
    setAccountData(null);
    try {
      // 1. Try bank-account API for dedicated virtual accounts
      const bankRes = await apiClient.get('/bank-account', { params: { currency: curr } });
      if (bankRes.data && bankRes.data.account_number) {
        setAccountData({
          account_number: bankRes.data.account_number,
          bank_name: bankRes.data.bank_name || 'NoteStandard Virtual Bank',
          account_name: bankRes.data.account_holder || 'NoteStandard User',
          currency: curr,
          iban: bankRes.data.iban,
          swift_code: bankRes.data.swift_code,
        });
        setLoading(false);
        return;
      }

      // 2. Fallback to deposit transfer endpoint to fetch dynamic virtual account details
      const depositRes = await apiClient.post('/wallet/deposit/transfer', { currency: curr, amount: 1000 });
      const details = depositRes.data?.bankDetails || depositRes.data?.instructions;
      if (details) {
        setAccountData({
          account_number: details.account_number || details.accountNumber,
          bank_name: details.bank_name || details.bankName || 'Partner Bank',
          account_name: details.account_name || details.accountName || 'NoteStandard Wallet',
          currency: curr,
          iban: details.iban,
          swift_code: details.swift_code || details.swiftCode,
          reference: depositRes.data?.reference,
        });
      } else {
        setAccountData(null);
      }
    } catch (e: any) {
      console.warn('[VirtualAccountModal] Fetch failed:', e);
      setAccountData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchVirtualAccount(selectedCurrency);
  }, [selectedCurrency]);

  const copyToClipboard = (text: string, label: string) => {
    Clipboard.setString(text);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  return (
    <LinearGradient colors={['#060611', '#0d0d1a']} style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Virtual Bank Account</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Currency Switcher */}
        <View style={styles.currencyRow}>
          {currencies.map(c => (
            <TouchableOpacity
              key={c}
              style={[styles.currencyChip, selectedCurrency === c && styles.currencyChipActive]}
              onPress={() => setSelectedCurrency(c)}
            >
              <Text style={[styles.currencyText, selectedCurrency === c && styles.currencyTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#6366f1" />
            <Text style={styles.loadingText}>Fetching {selectedCurrency} Virtual Account...</Text>
          </View>
        ) : accountData ? (
          <View style={styles.card}>
            <LinearGradient colors={['#1e1b4b', '#312e81']} style={styles.cardGradient}>
              <Text style={styles.cardBadge}>DEDICATED {accountData.currency} VIRTUAL ACCOUNT</Text>
              
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Bank Name</Text>
                <TouchableOpacity onPress={() => copyToClipboard(accountData.bank_name, 'Bank Name')}>
                  <Text style={styles.detailValue}>{accountData.bank_name} 📋</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Account Number / NUBAN</Text>
                <TouchableOpacity onPress={() => copyToClipboard(accountData.account_number, 'Account Number')}>
                  <Text style={styles.detailValueHighlight}>{accountData.account_number} 📋</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Account Name</Text>
                <TouchableOpacity onPress={() => copyToClipboard(accountData.account_name, 'Account Name')}>
                  <Text style={styles.detailValue}>{accountData.account_name} 📋</Text>
                </TouchableOpacity>
              </View>

              {accountData.iban ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>IBAN</Text>
                  <TouchableOpacity onPress={() => copyToClipboard(accountData.iban!, 'IBAN')}>
                    <Text style={styles.detailValue}>{accountData.iban} 📋</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {accountData.swift_code ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>SWIFT / BIC Code</Text>
                  <TouchableOpacity onPress={() => copyToClipboard(accountData.swift_code!, 'SWIFT Code')}>
                    <Text style={styles.detailValue}>{accountData.swift_code} 📋</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {copiedField && (
                <View style={styles.toast}>
                  <Text style={styles.toastText}>✓ Copied {copiedField} to clipboard</Text>
                </View>
              )}
            </LinearGradient>

            <View style={styles.noticeBox}>
              <Text style={styles.noticeTitle}>📌 Deposit Instructions</Text>
              <Text style={styles.noticeText}>
                Transfer funds directly to this virtual account from any bank app or mobile banking service.
                Deposits are automatically credited to your NoteStandard {selectedCurrency} balance upon confirmation.
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyIcon}>🏦</Text>
            <Text style={styles.emptyTitle}>No Virtual Account Yet</Text>
            <Text style={styles.emptyText}>
              A dedicated virtual account for {selectedCurrency} can be created automatically when making a bank transfer deposit.
            </Text>
            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => navigation.navigate('WalletAction', { type: 'deposit', currency: selectedCurrency })}
            >
              <Text style={styles.actionButtonText}>Initiate {selectedCurrency} Deposit</Text>
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
  closeBtn: { padding: 8 },
  closeText: { color: '#888', fontSize: 20, fontWeight: '700' },
  headerTitle: { color: '#fff', fontSize: 18, fontWeight: '800' },
  content: { padding: 20 },
  currencyRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  currencyChip: {
    flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: '#111122',
    borderWidth: 1, borderColor: '#222244', alignItems: 'center'
  },
  currencyChipActive: { backgroundColor: '#6366f1', borderColor: '#818cf8' },
  currencyText: { color: '#888', fontSize: 14, fontWeight: '700' },
  currencyTextActive: { color: '#fff' },
  loadingContainer: { padding: 40, alignItems: 'center' },
  loadingText: { color: '#888', fontSize: 14, marginTop: 12 },
  card: { gap: 16 },
  cardGradient: { borderRadius: 20, padding: 20, borderWidth: 1, borderColor: '#4338ca' },
  cardBadge: { color: '#a5b4fc', fontSize: 11, fontWeight: '800', letterSpacing: 1, marginBottom: 16 },
  detailRow: { marginBottom: 16 },
  detailLabel: { color: '#94a3b8', fontSize: 12, fontWeight: '600', marginBottom: 4 },
  detailValue: { color: '#fff', fontSize: 16, fontWeight: '700' },
  detailValueHighlight: { color: '#38bdf8', fontSize: 22, fontWeight: '900', letterSpacing: 1 },
  toast: { backgroundColor: '#10b981', padding: 10, borderRadius: 8, marginTop: 12, alignItems: 'center' },
  toastText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  noticeBox: { backgroundColor: '#111122', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#1e1e3a' },
  noticeTitle: { color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  noticeText: { color: '#888', fontSize: 13, lineHeight: 18 },
  emptyContainer: { padding: 40, alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 18, fontWeight: '800', marginBottom: 8 },
  emptyText: { color: '#888', fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  actionButton: { backgroundColor: '#6366f1', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 14 },
  actionButtonText: { color: '#fff', fontSize: 14, fontWeight: '700' }
});
