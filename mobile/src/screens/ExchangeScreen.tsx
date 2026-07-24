import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput,
  ScrollView, ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import apiClient from '../api/apiClient';

type ExchangeMode = 'convert' | 'buy' | 'sell' | 'swap';

const MODES: Array<{ id: ExchangeMode; label: string; icon: string; color: string; desc: string }> = [
  { id: 'convert', label: 'Convert Fiat',  icon: '⇄',  color: '#3b82f6', desc: 'Fiat ↔ Fiat' },
  { id: 'buy',     label: 'Buy Crypto',    icon: '🛒', color: '#10b981', desc: 'Fiat → Crypto' },
  { id: 'sell',    label: 'Sell Crypto',   icon: '💵', color: '#f97316', desc: 'Crypto → Fiat' },
  { id: 'swap',    label: 'Swap Crypto',   icon: '🔄', color: '#8b5cf6', desc: 'Crypto ↔ Crypto' },
];

const FIAT_OPTIONS   = ['NGN', 'USD', 'EUR', 'GBP'];
const CRYPTO_OPTIONS = ['BTC', 'ETH', 'USDT', 'USDC'];

const SYMBOLS: Record<string, string> = {
  NGN: '₦', USD: '$', EUR: '€', GBP: '£',
  BTC: '₿', ETH: 'Ξ', USDT: '₮', USDC: '●',
};

function getDefaultPair(mode: ExchangeMode): { from: string; to: string } {
  if (mode === 'buy')     return { from: 'NGN',  to: 'BTC'  };
  if (mode === 'sell')    return { from: 'BTC',  to: 'NGN'  };
  if (mode === 'swap')    return { from: 'BTC',  to: 'ETH'  };
  if (mode === 'convert') return { from: 'NGN',  to: 'USD'  };
  return { from: 'NGN', to: 'BTC' };
}

export default function ExchangeScreen() {
  const navigation = useNavigation<any>();
  const route      = useRoute<any>();
  const initialMode: ExchangeMode = route.params?.mode || 'buy';

  const [mode,         setMode]         = useState<ExchangeMode>(initialMode);
  const [fromCurrency, setFromCurrency] = useState(getDefaultPair(initialMode).from);
  const [toCurrency,   setToCurrency]   = useState(getDefaultPair(initialMode).to);
  const [amount,       setAmount]       = useState('');
  const [quote,        setQuote]        = useState<any>(null);
  const [loading,      setLoading]      = useState(false);
  const [executing,    setExecuting]    = useState(false);
  const [rates,        setRates]        = useState<Record<string, number>>({});

  // Load exchange rates on mount
  useEffect(() => {
    apiClient.get('/wallet/exchange-rates').then(res => {
      setRates(res.data?.rates || {});
    }).catch(() => {});
  }, []);

  // Update pair defaults when mode changes
  useEffect(() => {
    const pair = getDefaultPair(mode);
    setFromCurrency(pair.from);
    setToCurrency(pair.to);
    setQuote(null);
    setAmount('');
  }, [mode]);

  const fromOptions = (mode === 'sell' || mode === 'swap') ? CRYPTO_OPTIONS : FIAT_OPTIONS;
  const toOptions   = (mode === 'buy'  || mode === 'swap') ? CRYPTO_OPTIONS : FIAT_OPTIONS;

  // Live rate estimate
  const computedRate = (() => {
    if (!rates[fromCurrency] || !rates[toCurrency]) return null;
    return rates[fromCurrency] / rates[toCurrency];
  })();

  const estimatedOutput = computedRate && amount ? (parseFloat(amount) * computedRate) : null;

  const getQuote = async () => {
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount.');
      return;
    }
    setLoading(true);
    setQuote(null);
    try {
      const res = await apiClient.post('/wallet/swap/preview', {
        from: fromCurrency,
        to: toCurrency,
        amount: parseFloat(amount),
        slippage: 0.005,
      });
      setQuote(res.data);
    } catch (e: any) {
      Alert.alert('Quote Failed', e.response?.data?.error || 'Could not fetch quote. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const executeExchange = async () => {
    if (!quote) return;
    setExecuting(true);
    try {
      const key = `mob_${mode}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      await apiClient.post('/wallet/swap', {
        lockId: quote.lockId || quote.id,
        idempotencyKey: key,
      });
      Alert.alert('✅ Success', `Your ${mode} was completed successfully.`, [
        { text: 'Done', onPress: () => navigation.goBack() }
      ]);
    } catch (e: any) {
      Alert.alert('Failed', e.response?.data?.error || 'Exchange failed. Please try again.');
    } finally {
      setExecuting(false);
    }
  };

  const activeMode = MODES.find(m => m.id === mode)!;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backBtnText}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Exchange Hub</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 48 }}>
        {/* Mode selector */}
        <View style={styles.modeGrid}>
          {MODES.map(m => (
            <TouchableOpacity
              key={m.id}
              style={[
                styles.modeCard,
                mode === m.id && { borderColor: `${m.color}60`, backgroundColor: `${m.color}15` },
              ]}
              onPress={() => setMode(m.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.modeIcon}>{m.icon}</Text>
              <Text style={[styles.modeLabel, mode === m.id && { color: m.color }]}>{m.label}</Text>
              <Text style={styles.modeDesc}>{m.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Active mode indicator */}
        <View style={[styles.activeModeBar, { backgroundColor: `${activeMode.color}20`, borderColor: `${activeMode.color}40` }]}>
          <Text style={{ color: activeMode.color, fontWeight: '700', fontSize: 13 }}>
            {activeMode.icon} {activeMode.label} · {activeMode.desc}
          </Text>
        </View>

        {/* From currency */}
        <Text style={styles.label}>From</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyScroll}>
          {fromOptions.map(code => (
            <TouchableOpacity
              key={code}
              style={[styles.currencyChip, fromCurrency === code && styles.currencyChipActive]}
              onPress={() => { setFromCurrency(code); setQuote(null); }}
            >
              <Text style={[styles.currencyChipText, fromCurrency === code && { color: '#fff' }]}>
                {SYMBOLS[code]} {code}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Amount */}
        <Text style={styles.label}>Amount</Text>
        <View style={styles.amountRow}>
          <Text style={styles.amountSymbol}>{SYMBOLS[fromCurrency]}</Text>
          <TextInput
            style={styles.amountInput}
            value={amount}
            onChangeText={v => { setAmount(v); setQuote(null); }}
            placeholder="0.00"
            placeholderTextColor="#333"
            keyboardType="numeric"
          />
          <Text style={styles.amountCode}>{fromCurrency}</Text>
        </View>

        {/* Live estimate */}
        {estimatedOutput !== null && amount && parseFloat(amount) > 0 && (
          <Text style={styles.rateEstimate}>
            ≈ {estimatedOutput.toFixed(8)} {toCurrency}
            {'  '}(1 {fromCurrency} = {computedRate?.toFixed(8)} {toCurrency})
          </Text>
        )}

        {/* To currency */}
        <Text style={styles.label}>To</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.currencyScroll}>
          {toOptions.filter(c => c !== fromCurrency).map(code => (
            <TouchableOpacity
              key={code}
              style={[styles.currencyChip, toCurrency === code && styles.currencyChipActive]}
              onPress={() => { setToCurrency(code); setQuote(null); }}
            >
              <Text style={[styles.currencyChipText, toCurrency === code && { color: '#fff' }]}>
                {SYMBOLS[code]} {code}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Quote preview */}
        {quote && (
          <View style={styles.quoteBox}>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>You send</Text>
              <Text style={styles.quoteValue}>{quote.from_amount} {fromCurrency}</Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>You receive</Text>
              <Text style={[styles.quoteValue, { color: '#10b981' }]}>
                {Number(quote.to_amount).toFixed(8)} {toCurrency}
              </Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Rate</Text>
              <Text style={styles.quoteValueSmall}>
                1 {fromCurrency} = {Number(quote.rate).toFixed(8)} {toCurrency}
              </Text>
            </View>
            <View style={styles.quoteRow}>
              <Text style={styles.quoteLabel}>Fee</Text>
              <Text style={styles.quoteValueSmall}>{Number(quote.fee || 0).toFixed(4)} {fromCurrency}</Text>
            </View>
            <Text style={styles.quoteExpiry}>⏱ Quote valid for 2 minutes</Text>
          </View>
        )}

        {/* CTA */}
        {!quote ? (
          <TouchableOpacity
            style={[styles.ctaBtn, { opacity: loading || !amount ? 0.5 : 1 }]}
            onPress={getQuote}
            disabled={loading || !amount}
            activeOpacity={0.8}
          >
            <LinearGradient colors={['#6366f1', '#8b5cf6']} style={styles.ctaBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaBtnText}>Get Quote</Text>}
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <View style={styles.confirmRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setQuote(null)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.confirmBtn, { opacity: executing ? 0.6 : 1 }]}
              onPress={executeExchange}
              disabled={executing}
              activeOpacity={0.8}
            >
              <LinearGradient colors={['#10b981', '#059669']} style={styles.ctaBtnGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {executing ? <ActivityIndicator color="#fff" /> : <Text style={styles.ctaBtnText}>Confirm Exchange</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 60, paddingBottom: 16,
    borderBottomWidth: 1, borderColor: '#111133',
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  backBtnText: { color: '#888', fontSize: 20 },
  headerTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
  scroll: { flex: 1, padding: 20 },

  // Mode selector
  modeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 12 },
  modeCard: {
    width: '47%', backgroundColor: '#0d0d1e', borderRadius: 16, padding: 14,
    borderWidth: 1, borderColor: '#1a1a3e', alignItems: 'center',
  },
  modeIcon: { fontSize: 26, marginBottom: 6 },
  modeLabel: { color: '#e5e7eb', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  modeDesc: { color: '#6b7280', fontSize: 10, marginTop: 2, textAlign: 'center' },

  activeModeBar: {
    borderRadius: 12, padding: 12, marginBottom: 20,
    borderWidth: 1, alignItems: 'center',
  },

  // Form
  label: { color: '#888', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8, marginTop: 16 },
  currencyScroll: { flexGrow: 0, marginBottom: 4 },
  currencyChip: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20, marginRight: 8,
    backgroundColor: '#0d0d1e', borderWidth: 1, borderColor: '#1a1a3e',
  },
  currencyChipActive: { backgroundColor: '#6366f1', borderColor: '#6366f1' },
  currencyChipText: { color: '#9ca3af', fontSize: 13, fontWeight: '700' },

  amountRow: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#0d0d1e',
    borderRadius: 16, paddingHorizontal: 16, borderWidth: 1, borderColor: '#1a1a3e',
    marginBottom: 4,
  },
  amountSymbol: { color: '#6366f1', fontSize: 20, fontWeight: '800', marginRight: 8 },
  amountInput: { flex: 1, color: '#fff', fontSize: 26, fontWeight: '800', paddingVertical: 16 },
  amountCode: { color: '#6366f1', fontSize: 14, fontWeight: '700' },

  rateEstimate: { color: '#6b7280', fontSize: 12, marginBottom: 4, marginLeft: 2 },

  // Quote box
  quoteBox: {
    backgroundColor: '#6366f110', borderRadius: 16, padding: 18, marginTop: 20,
    borderWidth: 1, borderColor: '#6366f130',
  },
  quoteRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  quoteLabel: { color: '#9ca3af', fontSize: 13 },
  quoteValue: { color: '#fff', fontSize: 14, fontWeight: '700' },
  quoteValueSmall: { color: '#d1d5db', fontSize: 12 },
  quoteExpiry: { color: '#f59e0b', fontSize: 11, textAlign: 'center', marginTop: 6 },

  // Buttons
  ctaBtn: { marginTop: 28 },
  ctaBtnGradient: { padding: 18, borderRadius: 16, alignItems: 'center' },
  ctaBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  confirmRow: { flexDirection: 'row', gap: 12, marginTop: 28 },
  cancelBtn: {
    flex: 1, padding: 18, borderRadius: 16, alignItems: 'center',
    backgroundColor: '#ffffff0d', borderWidth: 1, borderColor: '#ffffff10',
  },
  cancelBtnText: { color: '#9ca3af', fontWeight: '700', fontSize: 15 },
  confirmBtn: { flex: 2, borderRadius: 16, overflow: 'hidden' },
});
