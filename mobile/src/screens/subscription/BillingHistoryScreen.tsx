import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Receipt,
  ArrowLeft,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react-native';

const ReceiptIcon = Receipt as any;
const ArrowLeftIcon = ArrowLeft as any;
const RefreshCwIcon = RefreshCw as any;
const CheckCircle2Icon = CheckCircle2 as any;
const AlertCircleIcon = AlertCircle as any;

import apiClient from '../../api/apiClient';

interface InvoiceItem {
  id: string;
  amount: number;
  currency: string;
  status: 'paid' | 'pending' | 'failed';
  date: string;
  invoice_url?: string;
}

interface BillingHistoryScreenProps {
  navigation: any;
}

export const BillingHistoryScreen: React.FC<BillingHistoryScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);

  const fetchBillingHistory = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/subscription/billing-history');
      const list = res.data?.history || res.data || [];
      setInvoices(list);
    } catch (err) {
      console.warn('[BillingHistory] Error loading history:', err);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBillingHistory();
  }, []);

  const handleSyncBilling = async () => {
    try {
      setSyncing(true);
      await apiClient.post('/subscription/sync');
      await fetchBillingHistory();
      Alert.alert('Billing History Updated', 'Synchronized payment records from authoritative billing engine.');
    } catch (err: any) {
      Alert.alert('Sync Error', 'Failed to synchronize billing history.');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Billing & Invoices</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={handleSyncBilling} disabled={syncing}>
          <RefreshCwIcon size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Text style={styles.sectionTitle}>Payment Statements ({invoices.length})</Text>

        {loading ? (
          <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 40 }} />
        ) : invoices.length === 0 ? (
          <View style={styles.emptyCard}>
            <ReceiptIcon size={36} color="#64748B" />
            <Text style={styles.emptyTitle}>No Billing Invoices</Text>
            <Text style={styles.emptySub}>When you subscribe or upgrade plans, your receipt invoices will appear here.</Text>
          </View>
        ) : (
          invoices.map(inv => (
            <View key={inv.id} style={styles.invoiceCard}>
              <View style={styles.invoiceLeft}>
                {inv.status === 'paid' ? (
                  <CheckCircle2Icon size={20} color="#10B981" />
                ) : (
                  <AlertCircleIcon size={20} color="#F59E0B" />
                )}
                <View>
                  <Text style={styles.invoiceAmount}>
                    ${Number(inv.amount || 0).toFixed(2)} {(inv.currency || 'USD').toUpperCase()}
                  </Text>
                  <Text style={styles.invoiceDate}>
                    {new Date(inv.date || Date.now()).toLocaleDateString()}
                  </Text>
                </View>
              </View>

              <View style={[styles.statusBadge, inv.status === 'paid' ? styles.statusPaid : styles.statusPending]}>
                <Text style={styles.statusText}>{(inv.status || 'PAID').toUpperCase()}</Text>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  backBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 16,
  },
  emptyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
    marginTop: 20,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 10,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  invoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1E293B',
    padding: 16,
    borderRadius: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  invoiceLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  invoiceAmount: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  invoiceDate: {
    fontSize: 12,
    color: '#94A3B8',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPaid: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  statusPending: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
