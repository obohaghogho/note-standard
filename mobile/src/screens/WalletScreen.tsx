import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, Modal, TextInput, Alert, FlatList
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import { API_URL } from '../Config';
import { AuthService } from '../services/AuthService';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../navigation/MainStack';

interface Wallet {
  id: string;
  currency: string;
  balance: number;
  available_balance: number;
  network?: string;
  asset?: string;
}

interface LedgerEntry {
  id: string;
  amount: number;
  currency: string;
  type: string;
  status: string;
  description?: string;
  created_at: string;
}

const CURRENCY_ICONS: Record<string, string> = {
  BTC: '₿', ETH: 'Ξ', USD: '$', NGN: '₦', EUR: '€', GBP: '£', JPY: '¥',
  USDT: '₮', USDC: '🔵', default: '◎'
};

const CURRENCY_COLORS: Record<string, [string, string]> = {
  BTC: ['#f59e0b', '#d97706'],
  ETH: ['#8b5cf6', '#6d28d9'],
  USD: ['#10b981', '#059669'],
  NGN: ['#6366f1', '#4f46e5'],
  EUR: ['#3b82f6', '#2563eb'],
  GBP: ['#ec4899', '#db2777'],
  USDT: ['#26a17b', '#1a7a5e'],
  default: ['#64748b', '#475569'],
};

export default function WalletScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);

  // Transfer Modal
  const [showTransfer, setShowTransfer] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);

  const getHeaders = async () => {
    const token = await AuthService.getToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'x-client-type': 'mobile', // bypasses reCAPTCHA on server
    };
  };

  const loadData = useCallback(async () => {
    try {
      const headers = await getHeaders();

      const [wRes, lRes] = await Promise.all([
        axios.get(`${API_URL}/api/wallet`, { headers }),          // FIXED: was /api/wallets
        axios.get(`${API_URL}/api/wallet/ledger`, { headers }),   // FIXED: was /api/wallets/ledger
      ]);

      const walletsData = wRes.data || [];
      setWallets(walletsData);
      if (walletsData.length > 0 && !selectedWallet) {
        setSelectedWallet(walletsData[0]);
      }
      setLedger(lRes.data?.entries || lRes.data || []);
    } catch (e) {
      console.error('[WalletScreen] Failed to load wallet data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleTransfer = async () => {
    if (!recipient.trim() || !transferAmount) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    setTransferLoading(true);
    try {
      const headers = await getHeaders();
      const res = await axios.post(
        `${API_URL}/api/wallet/transfer`,
        {
          recipient_username: recipient.trim(),
          amount: parseFloat(transferAmount),
          currency: selectedWallet?.currency || selectedWallet?.asset || 'USD',
        },
        { headers }
      );
      Alert.alert('✅ Success', res.data?.message || 'Transfer completed successfully');
      setShowTransfer(false);
      setRecipient('');
      setTransferAmount('');
      loadData();
    } catch (e: any) {
      Alert.alert('Error', e.response?.data?.error || 'Transfer failed');
    } finally {
      setTransferLoading(false);
    }
  };

  const totalBalance = wallets.reduce((sum, w) => sum + (w.balance || 0), 0);
  const primaryCurrency = selectedWallet?.currency || selectedWallet?.asset || 'USD';

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Wallet</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={onRefresh}>
          <Text style={styles.refreshText}>↻</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        {/* Balance Card */}
        <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Portfolio Value</Text>
          <Text style={styles.balanceValue}>
            {totalBalance.toFixed(2)} {primaryCurrency}
          </Text>
          <Text style={styles.subBalance}>
            Available: {(selectedWallet?.available_balance || selectedWallet?.balance || 0).toFixed(2)} {primaryCurrency}
          </Text>
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('WalletAction', { type: 'deposit', currency: primaryCurrency })}
            >
              <Text style={styles.actionEmoji}>📥</Text>
              <Text style={styles.actionBtnText}>Deposit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setShowTransfer(true)}>
              <Text style={styles.actionEmoji}>💸</Text>
              <Text style={styles.actionBtnText}>Send</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionBtn}
              onPress={() => navigation.navigate('WalletAction', { type: 'withdraw', currency: primaryCurrency })}
            >
              <Text style={styles.actionEmoji}>📤</Text>
              <Text style={styles.actionBtnText}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* Assets */}
        <Text style={styles.sectionTitle}>Your Assets</Text>
        {wallets.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No wallets found. Create one from the web.</Text>
          </View>
        ) : (
          wallets.map(w => {
            const curr = w.currency || w.asset || 'USD';
            const colors = CURRENCY_COLORS[curr] || CURRENCY_COLORS.default;
            const icon = CURRENCY_ICONS[curr] || CURRENCY_ICONS.default;
            const isSelected = selectedWallet?.id === w.id;

            return (
              <TouchableOpacity
                key={w.id}
                style={[styles.assetCard, isSelected && styles.assetCardSelected]}
                onPress={() => setSelectedWallet(w)}
                activeOpacity={0.8}
              >
                <LinearGradient colors={colors} style={styles.assetIcon}>
                  <Text style={styles.assetIconText}>{icon}</Text>
                </LinearGradient>
                <View style={styles.assetInfo}>
                  <Text style={styles.assetName}>{curr}</Text>
                  <Text style={styles.assetNetwork}>{w.network || 'Mainnet'}</Text>
                </View>
                <View style={styles.assetBalanceWrap}>
                  <Text style={styles.assetBalance}>{(w.balance || 0).toFixed(4)}</Text>
                  <Text style={styles.assetCurr}>{curr}</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}

        {/* Transaction History */}
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        {ledger.length > 0 ? (
          ledger.slice(0, 20).map(item => (
            <View key={item.id} style={styles.txItem}>
              <View style={styles.txIconWrap}>
                <Text style={{ fontSize: 20 }}>{item.amount > 0 ? '📥' : '📤'}</Text>
              </View>
              <View style={styles.txInfo}>
                <Text style={styles.txType}>{item.type?.replace(/_/g, ' ') || 'Transaction'}</Text>
                {item.description ? (
                  <Text style={styles.txDesc} numberOfLines={1}>{item.description}</Text>
                ) : null}
                <Text style={styles.txDate}>{new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
              </View>
              <View style={styles.txAmountWrap}>
                <Text style={[styles.txAmount, { color: item.amount > 0 ? '#10b981' : '#ef4444' }]}>
                  {item.amount > 0 ? '+' : ''}{item.amount} {item.currency}
                </Text>
                <Text style={styles.txStatus}>{item.status}</Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No transactions yet</Text>
          </View>
        )}
        <View style={{ height: 32 }} />
      </ScrollView>

      {/* Send Funds Modal */}
      <Modal visible={showTransfer} transparent animationType="slide" onRequestClose={() => setShowTransfer(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Send Funds</Text>
            <Text style={styles.modalHint}>Send to another NoteStandard user by username</Text>
            <Text style={styles.modalLabel}>Recipient Username</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="e.g. johndoe"
              placeholderTextColor="#555"
              value={recipient}
              onChangeText={setRecipient}
              autoCapitalize="none"
            />
            <Text style={styles.modalLabel}>Amount ({primaryCurrency})</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="0.00"
              placeholderTextColor="#555"
              value={transferAmount}
              onChangeText={setTransferAmount}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowTransfer(false)}>
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.confirmBtn} onPress={handleTransfer} disabled={transferLoading}>
                {transferLoading
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.confirmBtnText}>Send Now</Text>
                }
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060611' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: 60, paddingHorizontal: 20, paddingBottom: 16,
  },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  refreshBtn: { padding: 8 },
  refreshText: { color: '#6366f1', fontSize: 22 },
  scroll: { flex: 1, paddingHorizontal: 16 },
  balanceCard: { borderRadius: 24, padding: 24, marginBottom: 24 },
  balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '600' },
  balanceValue: { color: '#fff', fontSize: 36, fontWeight: '800', marginTop: 6 },
  subBalance: { color: 'rgba(255,255,255,0.6)', fontSize: 13, marginTop: 4 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  actionBtn: {
    flex: 1, backgroundColor: 'rgba(255,255,255,0.15)', paddingVertical: 12,
    borderRadius: 14, alignItems: 'center',
  },
  actionEmoji: { fontSize: 20, marginBottom: 4 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  sectionTitle: {
    color: '#555', fontSize: 12, fontWeight: '700', textTransform: 'uppercase',
    letterSpacing: 1.5, marginBottom: 12, marginTop: 4,
  },
  assetCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d1e',
    padding: 16, borderRadius: 18, marginBottom: 10, borderWidth: 1, borderColor: '#111133',
  },
  assetCardSelected: { borderColor: '#6366f1', backgroundColor: '#0d0d24' },
  assetIcon: {
    width: 44, height: 44, borderRadius: 14,
    justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  assetIconText: { fontSize: 18 },
  assetInfo: { flex: 1 },
  assetName: { color: '#fff', fontSize: 16, fontWeight: '700' },
  assetNetwork: { color: '#555', fontSize: 11, marginTop: 2 },
  assetBalanceWrap: { alignItems: 'flex-end' },
  assetBalance: { color: '#fff', fontSize: 15, fontWeight: '700' },
  assetCurr: { color: '#555', fontSize: 11 },
  txItem: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d1e',
    padding: 14, borderRadius: 16, marginBottom: 10, borderWidth: 1, borderColor: '#111133',
  },
  txIconWrap: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: '#111122',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  txInfo: { flex: 1 },
  txType: { color: '#fff', fontSize: 13, fontWeight: '600', textTransform: 'capitalize' },
  txDesc: { color: '#666', fontSize: 11, marginTop: 1 },
  txDate: { color: '#444', fontSize: 11, marginTop: 4 },
  txAmountWrap: { alignItems: 'flex-end' },
  txAmount: { fontSize: 13, fontWeight: '700' },
  txStatus: { fontSize: 10, color: '#666', marginTop: 3, textTransform: 'capitalize' },
  emptyCard: { backgroundColor: '#0d0d1e', borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 16 },
  emptyText: { color: '#555', fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: '#0d0d1e', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 28, borderWidth: 1, borderColor: '#1a1a3e',
  },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '800' },
  modalHint: { color: '#555', fontSize: 13, marginTop: 4, marginBottom: 16 },
  modalLabel: { color: '#888', fontSize: 12, fontWeight: '600', marginBottom: 8, marginTop: 12 },
  modalInput: {
    backgroundColor: '#060611', color: '#fff', padding: 16,
    borderRadius: 12, borderWidth: 1, borderColor: '#1a1a3e', fontSize: 15,
  },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 28, marginBottom: 8 },
  cancelBtn: { flex: 1, padding: 16, alignItems: 'center', borderRadius: 12, borderWidth: 1, borderColor: '#333' },
  cancelBtnText: { color: '#888', fontWeight: '600' },
  confirmBtn: { flex: 2, backgroundColor: '#6366f1', padding: 16, borderRadius: 12, alignItems: 'center' },
  confirmBtnText: { color: '#fff', fontWeight: '700' },
});
