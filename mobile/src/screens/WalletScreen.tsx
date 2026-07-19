import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, RefreshControl, FlatList, Alert, Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import apiClient from '../api/apiClient';
import { useNavigation } from '@react-navigation/native';
import { useIsFocused } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { MainStackParamList } from '../navigation/MainStack';

// ── Types ────────────────────────────────────────────────────────────────────
interface Wallet {
  id: string;
  currency: string;
  balance: number;
  available_balance: number;
  network?: string;
  address?: string;
  asset?: string;
}

interface CurrencyMeta {
  code: string;
  name: string;
  symbol: string;
  flag: string;
  color: string;
  status: 'active' | 'coming_soon' | 'disabled';
  deposit_enabled?: boolean;
  withdraw_enabled?: boolean;
  buy_enabled?: boolean;
  sell_enabled?: boolean;
  swap_enabled?: boolean;
  decimal_places?: number;
  networks?: string[];
}

interface LedgerEntry {
  id: string;
  amount: number;
  currency: string;
  type?: string;
  activity_type?: string;
  status: string;
  created_at: string;
}

// ── Currency metadata ─────────────────────────────────────────────────────────
const CURRENCY_ICONS: Record<string, string> = {
  BTC: '₿', ETH: 'Ξ', USD: '$', NGN: '₦',
  EUR: '€', GBP: '£', USDT: '₮', USDC: '●', default: '◎',
};

const CURRENCY_FLAGS: Record<string, string> = {
  NGN: '🇳🇬', USD: '🇺🇸', EUR: '🇪🇺', GBP: '🇬🇧',
  BTC: '🟠', ETH: '🔷', USDT: '🟢', USDC: '🔵',
};

const CURRENCY_COLORS: Record<string, [string, string]> = {
  BTC:  ['#f59e0b', '#d97706'],
  ETH:  ['#8b5cf6', '#6d28d9'],
  USD:  ['#10b981', '#059669'],
  NGN:  ['#6366f1', '#4f46e5'],
  EUR:  ['#3b82f6', '#2563eb'],
  GBP:  ['#ec4899', '#db2777'],
  USDT: ['#26a17b', '#1a7a5e'],
  USDC: ['#2775ca', '#1a5aad'],
  default: ['#64748b', '#475569'],
};

const FIAT_CODES  = ['NGN', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'];
const CRYPTO_CODES = ['BTC', 'ETH', 'USDT', 'USDC'];

// ── Default catalog ───────────────────────────────────────────────────────────
const DEFAULT_FIAT: CurrencyMeta[] = [
  { code: 'NGN', name: 'Nigerian Naira',  symbol: '₦', flag: '🇳🇬', color: '#6366f1', status: 'active' },
  { code: 'USD', name: 'US Dollar',       symbol: '$', flag: '🇺🇸', color: '#10b981', status: 'coming_soon' },
  { code: 'EUR', name: 'Euro',            symbol: '€', flag: '🇪🇺', color: '#3b82f6', status: 'coming_soon' },
  { code: 'GBP', name: 'British Pound',   symbol: '£', flag: '🇬🇧', color: '#ec4899', status: 'coming_soon' },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', flag: '🇨🇦', color: '#ff4d4d', status: 'coming_soon' },
  { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', flag: '🇦🇺', color: '#000080', status: 'coming_soon' },
];

const DEFAULT_CRYPTO: CurrencyMeta[] = [
  { code: 'BTC',  name: 'Bitcoin',  symbol: '₿', flag: '🟠', color: '#f59e0b', status: 'active', networks: ['bitcoin', 'BEP20'] },
  { code: 'ETH',  name: 'Ethereum', symbol: 'Ξ', flag: '🔷', color: '#8b5cf6', status: 'active', networks: ['ERC20', 'BEP20'] },
  { code: 'USDT', name: 'Tether',   symbol: '₮', flag: '🟢', color: '#26a17b', status: 'active', networks: ['TRC20', 'ERC20'] },
  { code: 'USDC', name: 'USD Coin', symbol: '●', flag: '🔵', color: '#2775ca', status: 'active', networks: ['ERC20', 'BEP20'] },
];

// ── Tab type ──────────────────────────────────────────────────────────────────
type HubTab = 'fiat' | 'crypto' | 'exchange';

// ─────────────────────────────────────────────────────────────────────────────
export default function WalletScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const isFocused = useIsFocused();

  const [activeTab, setActiveTab]   = useState<HubTab>('fiat');
  const [wallets,  setWallets]      = useState<Wallet[]>([]);
  const [ledger,   setLedger]       = useState<LedgerEntry[]>([]);
  const [fiatCatalog,   setFiatCatalog]   = useState<CurrencyMeta[]>(DEFAULT_FIAT);
  const [cryptoCatalog, setCryptoCatalog] = useState<CurrencyMeta[]>(DEFAULT_CRYPTO);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showBalances, setShowBalances] = useState(true);
  const [rates, setRates] = useState<Record<string, number>>({});

  // ── Data loading ─────────────────────────────────────────────────────────
  const loadData = useCallback(async () => {
    try {
      const [wRes, lRes, rRes, cRes] = await Promise.allSettled([
        apiClient.get('/wallet'),
        apiClient.get('/wallet/ledger', { params: { limit: 15 } }),
        apiClient.get('/wallet/exchange-rates'),
        apiClient.get('/wallet/currencies'),
      ]);

      if (wRes.status === 'fulfilled') {
        const raw = wRes.value.data || [];
        setWallets(raw.map((w: any) => ({
          ...w,
          balance: parseFloat(w.balance) || 0,
          available_balance: parseFloat(w.available_balance ?? w.balances?.available ?? w.balance) || 0,
        })));
      }

      if (lRes.status === 'fulfilled') {
        setLedger(lRes.value.data?.entries || lRes.value.data || []);
      }

      if (rRes.status === 'fulfilled') {
        setRates(rRes.value.data?.rates || {});
      }

      if (cRes.status === 'fulfilled') {
        const catalog = cRes.value.data;
        if (catalog?.fiat?.length  > 0) setFiatCatalog(catalog.fiat);
        if (catalog?.crypto?.length > 0) setCryptoCatalog(catalog.crypto);
      }
    } catch (e) {
      console.error('[WalletScreen] loadData error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (isFocused) { setLoading(true); loadData(); }
  }, [isFocused, loadData]);

  // ── Helpers ──────────────────────────────────────────────────────────────
  const getWallet = (code: string) =>
    wallets.find(w => (w.currency || w.asset || '').toUpperCase() === code.toUpperCase());

  const formatBalance = (amount: number, code: string, decimals = 2) => {
    if (!showBalances) return '••••';
    const abs = Math.abs(amount);
    if (abs === 0) return '0.00';
    if (['BTC', 'ETH'].includes(code)) return abs.toFixed(6);
    return abs.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  const toUSD = (amount: number, code: string) => {
    if (code === 'USD') return amount;
    const r = rates[code];
    return r && r > 0 ? amount * r : 0;
  };

  const totalFiatUSD   = fiatCatalog.reduce((s, c)   => s + toUSD(getWallet(c.code)?.balance || 0, c.code), 0);
  const totalCryptoUSD = cryptoCatalog.reduce((s, c) => s + toUSD(getWallet(c.code)?.balance || 0, c.code), 0);
  const totalUSD       = totalFiatUSD + totalCryptoUSD;
  const ngnRate        = rates['NGN'] || 0.00066;
  const totalNGN       = totalUSD / ngnRate;

  const onRefresh = () => { setRefreshing(true); loadData(); };

  // ── Navigate to action ───────────────────────────────────────────────────
  const goToAction = (type: string, currency: string) => {
    (navigation as any).navigate('WalletAction', { type, currency });
  };

  const goToExchange = (mode?: string) => {
    (navigation as any).navigate('Exchange', { mode: mode || 'buy' });
  };

  // ── Tab bar ───────────────────────────────────────────────────────────────
  const renderTabs = () => (
    <View style={styles.tabBar}>
      {(['fiat', 'crypto', 'exchange'] as HubTab[]).map(tab => (
        <TouchableOpacity
          key={tab}
          style={[styles.tabBtn, activeTab === tab && styles.tabBtnActive]}
          onPress={() => setActiveTab(tab)}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabLabel, activeTab === tab && styles.tabLabelActive]}>
            {tab === 'fiat' ? '🏦 Fiat' : tab === 'crypto' ? '₿ Crypto' : '⇄ Exchange'}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  // ── Portfolio summary card ────────────────────────────────────────────────
  const renderPortfolio = () => (
    <LinearGradient
      colors={['#0f0f23', '#1a1a3a', '#0f0f23']}
      style={styles.portfolioCard}
      start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
    >
      <View style={styles.portfolioHeader}>
        <Text style={styles.portfolioLabel}>Portfolio Value</Text>
        <TouchableOpacity onPress={() => setShowBalances(b => !b)}>
          <Text style={styles.eyeBtn}>{showBalances ? '👁' : '🙈'}</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.portfolioTotal}>
        {showBalances ? `₦${totalNGN.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '₦ ••••••'}
      </Text>
      <Text style={styles.portfolioUSD}>
        {showBalances ? `≈ $${totalUSD.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '≈ $ ••••'}
      </Text>

      <View style={styles.portfolioRow}>
        <View style={styles.portfolioChip}>
          <View style={[styles.dot, { backgroundColor: '#6366f1' }]} />
          <Text style={styles.chipLabel}>Fiat</Text>
          <Text style={styles.chipValue}>
            {showBalances ? `$${totalFiatUSD.toFixed(2)}` : '••••'}
          </Text>
        </View>
        <View style={styles.portfolioChip}>
          <View style={[styles.dot, { backgroundColor: '#f59e0b' }]} />
          <Text style={styles.chipLabel}>Crypto</Text>
          <Text style={styles.chipValue}>
            {showBalances ? `$${totalCryptoUSD.toFixed(2)}` : '••••'}
          </Text>
        </View>
      </View>
    </LinearGradient>
  );

  // ── Fiat wallet card ──────────────────────────────────────────────────────
  const renderFiatCard = ({ item: meta }: { item: CurrencyMeta }) => {
    const wallet   = getWallet(meta.code);
    const balance  = wallet?.balance || 0;
    const isActive = meta.status === 'active';
    const colors   = CURRENCY_COLORS[meta.code] || CURRENCY_COLORS.default;

    return (
      <TouchableOpacity
        style={[styles.walletCard, !isActive && styles.walletCardLocked]}
        activeOpacity={isActive ? 0.8 : 0.95}
        onPress={() => {
          if (!isActive) {
            Alert.alert(
              'International Wallet',
              `${meta.name} (${meta.code}) international deposits and payments will be available soon. Your wallet will automatically become active once this feature is enabled.`,
              [{ text: 'Got it', style: 'default' }]
            );
          }
        }}
      >
        <LinearGradient
          colors={isActive ? [`${colors[0]}22`, `${colors[1]}11`] : ['#111122', '#0d0d1a']}
          style={styles.walletCardGradient}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={[styles.currencyIcon, { backgroundColor: `${colors[0]}20`, borderColor: `${colors[0]}40` }]}>
              <Text style={styles.currencyIconText}>{meta.flag}</Text>
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.currencyCode}>{meta.code}</Text>
              <Text style={styles.currencyName}>{meta.name}</Text>
            </View>
            {!isActive && (
              <View style={styles.lockedBadge}>
                <Text style={styles.lockedText}>🔒 Soon</Text>
              </View>
            )}
          </View>

          {/* Balance */}
          <Text style={styles.balanceAmount}>
            {isActive ? `${meta.symbol}${formatBalance(balance, meta.code)}` : '—'}
          </Text>

          {/* Actions */}
          {isActive && (
            <View style={styles.actionRow}>
              <TouchableOpacity style={styles.actionBtn} onPress={() => goToAction('deposit', meta.code)}>
                <Text style={styles.actionBtnText}>⬇ Deposit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionBtn} onPress={() => goToAction('withdraw', meta.code)}>
                <Text style={styles.actionBtnText}>⬆ Withdraw</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAccent]} onPress={() => goToExchange('buy')}>
                <Text style={[styles.actionBtnText, { color: '#a78bfa' }]}>⇄ Buy Crypto</Text>
              </TouchableOpacity>
            </View>
          )}
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  // ── Crypto wallet card ────────────────────────────────────────────────────
  const renderCryptoCard = ({ item: meta }: { item: CurrencyMeta }) => {
    const wallet  = getWallet(meta.code);
    const balance = wallet?.balance || 0;
    const usdVal  = toUSD(balance, meta.code);
    const colors  = CURRENCY_COLORS[meta.code] || CURRENCY_COLORS.default;

    return (
      <View style={styles.walletCard}>
        <LinearGradient
          colors={[`${colors[0]}22`, `${colors[1]}11`]}
          style={styles.walletCardGradient}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          {/* Header */}
          <View style={styles.cardHeader}>
            <View style={[styles.currencyIcon, { backgroundColor: `${colors[0]}20`, borderColor: `${colors[0]}40` }]}>
              <Text style={[styles.currencyIconText, { color: colors[0] }]}>{meta.symbol}</Text>
            </View>
            <View style={styles.cardHeaderText}>
              <Text style={styles.currencyCode}>{meta.code}</Text>
              <Text style={styles.currencyName}>{meta.name}</Text>
            </View>
            {/* Network badges */}
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {(meta.networks || []).slice(0, 1).map(net => (
                <View key={net} style={styles.networkBadge}>
                  <Text style={styles.networkBadgeText}>{net}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Balance */}
          <View style={styles.cryptoBalanceRow}>
            <Text style={styles.balanceAmount}>
              {showBalances ? `${meta.symbol}${formatBalance(balance, meta.code, meta.decimal_places)}` : '••••••'}
            </Text>
            <Text style={styles.usdEquiv}>
              {showBalances ? `≈ $${usdVal.toFixed(2)}` : ''}
            </Text>
          </View>

          {/* Actions */}
          <View style={styles.actionRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => goToAction('deposit', meta.code)}>
              <Text style={styles.actionBtnText}>⬇ Deposit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={() => goToAction('withdraw', meta.code)}>
              <Text style={styles.actionBtnText}>⬆ Withdraw</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, styles.actionBtnAccent]} onPress={() => goToExchange('swap')}>
              <Text style={[styles.actionBtnText, { color: '#a78bfa' }]}>⇄ Swap</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    );
  };

  // ── Exchange tab ──────────────────────────────────────────────────────────
  const renderExchangeTab = () => {
    const EXCHANGE_ACTIONS = [
      { mode: 'convert', label: 'Convert Fiat',  desc: 'Fiat ↔ Fiat',   icon: '⇄', color: '#3b82f6' },
      { mode: 'buy',     label: 'Buy Crypto',    desc: 'Fiat → Crypto', icon: '🛒', color: '#10b981' },
      { mode: 'sell',    label: 'Sell Crypto',   desc: 'Crypto → Fiat', icon: '💵', color: '#f97316' },
      { mode: 'swap',    label: 'Swap Crypto',   desc: 'Crypto ↔ Crypto', icon: '🔄', color: '#8b5cf6' },
    ];

    const QUICK_PAIRS = [
      { from: 'NGN', to: 'BTC', label: 'NGN → BTC' },
      { from: 'BTC', to: 'NGN', label: 'BTC → NGN' },
      { from: 'ETH', to: 'USDT', label: 'ETH → USDT' },
      { from: 'NGN', to: 'USDT', label: 'NGN → USDT' },
      { from: 'BTC', to: 'ETH', label: 'BTC → ETH' },
    ];

    return (
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 16 }}>
        {/* Four action cards */}
        <Text style={styles.sectionTitle}>Exchange Actions</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
          {EXCHANGE_ACTIONS.map(action => (
            <TouchableOpacity
              key={action.mode}
              style={[styles.exchangeActionCard, { borderColor: `${action.color}40` }]}
              onPress={() => goToExchange(action.mode)}
              activeOpacity={0.7}
            >
              <Text style={{ fontSize: 28, marginBottom: 6 }}>{action.icon}</Text>
              <Text style={[styles.exchangeActionLabel, { color: action.color }]}>{action.label}</Text>
              <Text style={styles.exchangeActionDesc}>{action.desc}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quick pairs */}
        <Text style={styles.sectionTitle}>Quick Convert</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {QUICK_PAIRS.map(pair => (
            <TouchableOpacity
              key={pair.label}
              style={styles.quickPairChip}
              onPress={() => goToExchange(
                CRYPTO_CODES.includes(pair.from) && FIAT_CODES.includes(pair.to) ? 'sell' :
                FIAT_CODES.includes(pair.from) && CRYPTO_CODES.includes(pair.to) ? 'buy' : 'swap'
              )}
              activeOpacity={0.7}
            >
              <Text style={styles.quickPairText}>{pair.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Recent activity preview */}
        <Text style={styles.sectionTitle}>Recent Activity</Text>
        {ledger.slice(0, 5).map(entry => {
          const type = entry.activity_type || entry.type || 'TX';
          const isCredit = entry.amount > 0;
          return (
            <View key={entry.id} style={styles.ledgerRow}>
              <View style={[styles.ledgerIcon, { backgroundColor: isCredit ? '#10b98115' : '#ef444415' }]}>
                <Text>{isCredit ? '⬇' : '⬆'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.ledgerType}>{type.replace(/_/g, ' ')}</Text>
                <Text style={styles.ledgerStatus}>{entry.status}</Text>
              </View>
              <Text style={[styles.ledgerAmount, { color: isCredit ? '#10b981' : '#ef4444' }]}>
                {isCredit ? '+' : '-'}{Math.abs(entry.amount).toFixed(4)} {entry.currency}
              </Text>
            </View>
          );
        })}
      </ScrollView>
    );
  };

  // ── Activity section (shown under fiat/crypto tabs) ───────────────────────
  const renderActivity = () => (
    <View style={styles.activitySection}>
      <Text style={styles.sectionTitle}>Recent Activity</Text>
      {ledger.slice(0, 8).map(entry => {
        const isCredit = entry.amount > 0;
        return (
          <View key={entry.id} style={styles.ledgerRow}>
            <View style={[styles.ledgerIcon, { backgroundColor: isCredit ? '#10b98115' : '#ef444415' }]}>
              <Text>{isCredit ? '⬇' : '⬆'}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ledgerType}>
                {(entry.activity_type || entry.type || 'Transaction').replace(/_/g, ' ')}
              </Text>
              <Text style={styles.ledgerStatus}>{entry.status}</Text>
            </View>
            <Text style={[styles.ledgerAmount, { color: isCredit ? '#10b981' : '#ef4444' }]}>
              {isCredit ? '+' : '-'}{Math.abs(entry.amount).toFixed(4)} {entry.currency}
            </Text>
          </View>
        );
      })}
    </View>
  );

  // ── Render ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#6366f1" />
        <Text style={styles.loadingText}>Loading your wallets...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Portfolio always visible */}
      {renderPortfolio()}
      {renderTabs()}

      {/* Tab content */}
      {activeTab === 'exchange' ? (
        renderExchangeTab()
      ) : (
        <FlatList
          data={activeTab === 'fiat' ? fiatCatalog : cryptoCatalog}
          keyExtractor={item => item.code}
          renderItem={activeTab === 'fiat' ? renderFiatCard : renderCryptoCard}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6366f1" />}
          contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}
          ListFooterComponent={renderActivity}
        />
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#060611' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#060611' },
  loadingText: { color: '#6366f1', marginTop: 12, fontSize: 14 },

  // Portfolio card
  portfolioCard: { margin: 16, borderRadius: 24, padding: 24, borderWidth: 1, borderColor: '#ffffff08' },
  portfolioHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  portfolioLabel: { color: '#9ca3af', fontSize: 12, fontWeight: '600', letterSpacing: 1, textTransform: 'uppercase' },
  eyeBtn: { fontSize: 18 },
  portfolioTotal: { color: '#ffffff', fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  portfolioUSD: { color: '#6b7280', fontSize: 13, marginTop: 2, marginBottom: 16 },
  portfolioRow: { flexDirection: 'row', gap: 10 },
  portfolioChip: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: '#ffffff08', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#ffffff08',
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipLabel: { color: '#9ca3af', fontSize: 11, fontWeight: '600', flex: 1 },
  chipValue: { color: '#ffffff', fontSize: 12, fontWeight: '700' },

  // Tab bar
  tabBar: {
    flexDirection: 'row', marginHorizontal: 16, marginBottom: 4,
    backgroundColor: '#ffffff08', borderRadius: 16, padding: 4,
    borderWidth: 1, borderColor: '#ffffff08',
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#6366f1' },
  tabLabel: { color: '#6b7280', fontSize: 12, fontWeight: '700' },
  tabLabelActive: { color: '#ffffff' },

  // Wallet card
  walletCard: { borderRadius: 20, overflow: 'hidden', borderWidth: 1, borderColor: '#ffffff08' },
  walletCardLocked: { opacity: 0.7 },
  walletCardGradient: { padding: 18 },

  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14, gap: 12 },
  currencyIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  currencyIconText: { fontSize: 22 },
  cardHeaderText: { flex: 1 },
  currencyCode: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  currencyName: { color: '#6b7280', fontSize: 12 },

  lockedBadge: { backgroundColor: '#374151', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  lockedText: { color: '#9ca3af', fontSize: 11, fontWeight: '600' },

  balanceAmount: { color: '#ffffff', fontSize: 26, fontWeight: '900', letterSpacing: -0.5, marginBottom: 14 },

  cryptoBalanceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 14 },
  usdEquiv: { color: '#6b7280', fontSize: 13 },

  networkBadge: { backgroundColor: '#ffffff10', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: '#ffffff08' },
  networkBadgeText: { color: '#9ca3af', fontSize: 9, fontWeight: '700' },

  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { flex: 1, backgroundColor: '#ffffff0d', borderRadius: 10, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#ffffff08' },
  actionBtnAccent: { borderColor: '#6366f130' },
  actionBtnText: { color: '#d1d5db', fontSize: 11, fontWeight: '700' },

  // Exchange tab
  exchangeActionCard: {
    width: '47%', backgroundColor: '#0d0d1e', borderRadius: 16, padding: 16,
    borderWidth: 1, alignItems: 'center',
  },
  exchangeActionLabel: { fontSize: 13, fontWeight: '800', marginBottom: 2 },
  exchangeActionDesc: { color: '#6b7280', fontSize: 10 },

  quickPairChip: {
    backgroundColor: '#ffffff08', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8,
    borderWidth: 1, borderColor: '#ffffff08',
  },
  quickPairText: { color: '#d1d5db', fontSize: 12, fontWeight: '600' },

  // Activity
  activitySection: { paddingHorizontal: 4, paddingTop: 8 },
  sectionTitle: { color: '#9ca3af', fontSize: 12, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 },

  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#ffffff05' },
  ledgerIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  ledgerType: { color: '#e5e7eb', fontSize: 13, fontWeight: '600' },
  ledgerStatus: { color: '#6b7280', fontSize: 11, marginTop: 1 },
  ledgerAmount: { fontSize: 13, fontWeight: '700' },
});
