import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, 
  ActivityIndicator, RefreshControl, FlatList
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import axios from 'axios';
import { API_URL } from '../Config';
import { AuthService } from '../services/AuthService';

interface Wallet {
  id: string;
  currency: string;
  balance: number;
  available_balance: number;
  network?: string;
}

interface LedgerEntry {
  id: string;
  amount: number;
  currency: string;
  type: string;
  status: string;
  created_at: string;
}

export default function WalletScreen() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const token = await AuthService.getToken();
      const headers = { Authorization: `Bearer ${token}` };
      
      const [wRes, lRes] = await Promise.all([
        axios.get(`${API_URL}/api/wallets`, { headers }),
        axios.get(`${API_URL}/api/wallets/ledger`, { headers })
      ]);

      setWallets(wRes.data || []);
      setLedger(lRes.data.entries || []);
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

  const renderTransaction = ({ item }: { item: LedgerEntry }) => (
    <View style={styles.txItem}>
      <View style={styles.txIcon}>
        <Text style={{ fontSize: 18 }}>{item.amount > 0 ? '💰' : '💸'}</Text>
      </View>
      <View style={styles.txInfo}>
        <Text style={styles.txType}>{item.type}</Text>
        <Text style={styles.txDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
      </View>
      <View style={styles.txAmount}>
        <Text style={[styles.amountText, { color: item.amount > 0 ? '#10b981' : '#ef4444' }]}>
          {item.amount > 0 ? '+' : ''}{item.amount} {item.currency}
        </Text>
        <Text style={styles.txStatus}>{item.status}</Text>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  const mainWallet = wallets[0];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Wallet</Text>
      </View>

      <ScrollView 
        style={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
      >
        <LinearGradient colors={['#6366f1', '#4f46e5']} style={styles.balanceCard}>
          <Text style={styles.balanceLabel}>Total Balance</Text>
          <Text style={styles.balanceValue}>
            {mainWallet ? `${mainWallet.balance} ${mainWallet.currency}` : '0.00'}
          </Text>
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn}>
              <Text style={styles.actionBtnText}>Deposit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}>
              <Text style={styles.actionBtnText}>Send</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn}>
              <Text style={styles.actionBtnText}>Withdraw</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <Text style={styles.sectionTitle}>Your Assets</Text>
        {wallets.map(w => (
          <View key={w.id} style={styles.assetCard}>
            <View style={styles.assetInfo}>
              <Text style={styles.assetName}>{w.currency}</Text>
              <Text style={styles.assetNetwork}>{w.network || 'Mainnet'}</Text>
            </View>
            <Text style={styles.assetBalance}>{w.balance} {w.currency}</Text>
          </View>
        ))}

        <Text style={styles.sectionTitle}>Recent Activity</Text>
        {ledger.length > 0 ? (
          ledger.map(item => (
            <View key={item.id} style={styles.txItem}>
               <View style={styles.txIcon}>
                <Text style={{ fontSize: 18 }}>{item.amount > 0 ? '📥' : '📤'}</Text>
              </View>
              <View style={styles.txInfo}>
                <Text style={styles.txType}>{item.type}</Text>
                <Text style={styles.txDate}>{new Date(item.created_at).toLocaleDateString()}</Text>
              </View>
              <View style={styles.txAmount}>
                <Text style={[styles.amountText, { color: item.amount > 0 ? '#10b981' : '#ef4444' }]}>
                  {item.amount > 0 ? '+' : ''}{item.amount} {item.currency}
                </Text>
                <Text style={styles.txStatus}>{item.status}</Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No recent activity</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060611' },
  header: { paddingTop: 60, paddingHorizontal: 20, paddingBottom: 20 },
  title: { color: '#fff', fontSize: 28, fontWeight: '800' },
  scroll: { flex: 1, paddingHorizontal: 16 },
  balanceCard: { borderRadius: 24, padding: 24, marginBottom: 28 },
  balanceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 14, fontWeight: '600' },
  balanceValue: { color: '#fff', fontSize: 36, fontWeight: '800', marginTop: 8 },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 24 },
  actionBtn: { flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  sectionTitle: { color: '#666', fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, marginTop: 8 },
  assetCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#0d0d1e', padding: 18, borderRadius: 18, marginBottom: 10, borderWidth: 1, borderColor: '#111133' },
  assetName: { color: '#fff', fontSize: 17, fontWeight: '700' },
  assetNetwork: { color: '#444', fontSize: 11, marginTop: 2 },
  assetBalance: { color: '#fff', fontSize: 16, fontWeight: '600' },
  txItem: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d1e', padding: 16, borderRadius: 18, marginBottom: 10, borderWidth: 1, borderColor: '#111133' },
  txIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#111122', justifyContent: 'center', alignItems: 'center', marginRight: 14 },
  txInfo: { flex: 1 },
  txType: { color: '#fff', fontSize: 14, fontWeight: '600' },
  txDate: { color: '#444', fontSize: 11, marginTop: 4 },
  txAmount: { alignItems: 'flex-end' },
  amountText: { fontSize: 14, fontWeight: '700' },
  txStatus: { fontSize: 10, color: '#666', marginTop: 4, textTransform: 'capitalize' },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { color: '#444', fontSize: 14 }
});
