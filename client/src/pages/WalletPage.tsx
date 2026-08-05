import { useState, useEffect } from 'react';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { useWallet } from '../hooks/useWallet';
import walletApi from '../api/walletApi';
import { PortfolioDashboard } from '../components/wallet/PortfolioDashboard';
import { WalletHubTabs } from '../components/wallet/WalletHubTabs';
import { FiatWalletCard } from '../components/wallet/FiatWalletCard';
import { CryptoWalletCard } from '../components/wallet/CryptoWalletCard';
import { ExchangeHub } from '../components/wallet/ExchangeHub';
import { RecentActivity } from '../components/wallet/RecentActivity';
import { VirtualAccountDetails } from '../components/wallet/VirtualAccountDetails';
import { FundModal } from '../components/wallet/FundModal';
import { TransferModal } from '../components/wallet/TransferModal';
import { WithdrawModal } from '../components/wallet/WithdrawModal';
import { ReceiveModal } from '../components/wallet/ReceiveModal';
import { RefreshCw, Plus, X, Clock, ShieldAlert } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/common/Button';
import toast from 'react-hot-toast';

import {
  FIAT_CURRENCY_CATALOG,
  CRYPTO_CURRENCY_CATALOG,
} from '../config/currencyConfig';
import type { CurrencyConfig, CryptoCurrencyConfig } from '../config/currencyConfig';
import { CurrencyFeatureService } from '../../../shared/services/CurrencyFeatureService';

import type { TabId as HubTab } from '../components/wallet/WalletHubTabs';

function WalletHubContent() {
  const { wallets, loading, refresh, createWallet } = useWallet();

  // Hub state
  const [activeTab, setActiveTab] = useState<HubTab>('fiat');
  const [showBalances, setShowBalances] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedCrypto, setExpandedCrypto] = useState<string | null>(null);

  // Configuration-driven catalogs
  const [fiatCatalog, setFiatCatalog] = useState<CurrencyConfig[]>(FIAT_CURRENCY_CATALOG);
  const [cryptoCatalog] = useState<CryptoCurrencyConfig[]>(CRYPTO_CURRENCY_CATALOG);

  // Live rates
  const [rates, setRates] = useState<Record<string, number>>({} as Record<string, number>);

  // Selected asset for modals
  const [selectedAsset, setSelectedAsset] = useState<{ currency: string; network: string }>({ currency: 'NGN', network: 'native' });
  const [isBuyMode, setIsBuyMode] = useState(false);

  // Modal visibility
  const [showFundModal, setShowFundModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showWithdrawModal, setShowWithdrawModal] = useState(false);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Last used fiat for "Buy Crypto" smart default
  const lastBuyFiat = typeof window !== 'undefined'
    ? (localStorage.getItem('lastBuyCryptoCurrency') || 'NGN')
    : 'NGN';

  // ── Sync catalog with server or configuration ──────────────────────────────
  useEffect(() => {
    walletApi.getCurrencies().then(serverCatalog => {
      if (serverCatalog?.fiat?.length > 0) {
        // Merge server catalog with client configuration rules to enforce active vs coming soon policies
        const mergedFiat = FIAT_CURRENCY_CATALOG.map(clientCurr => {
          const match = serverCatalog.fiat.find((s: any) => s.code === clientCurr.code);
          if (match) {
            return {
              ...clientCurr,
              // Client config is the authority: active stays active, coming_soon stays coming_soon
              status: (clientCurr.status === 'active' ? 'active' : 'coming_soon') as CurrencyConfig['status'],
            };
          }
          return clientCurr;
        });
        setFiatCatalog(mergedFiat);
      }
    }).catch(() => { /* use configuration default */ });
  }, []);

  // ── Load exchange rates ───────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    const fetchRates = async () => {
      try {
        const data = await walletApi.getExchangeRates();
        if (active && data?.rates) setRates(data.rates as Record<string, number>);
      } catch { /* silent */ }
    };
    fetchRates();
    const iv = setInterval(fetchRates, 30000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  // ── Refresh on mount ──────────────────────────────────────────────────────
  useEffect(() => { refresh(); }, [refresh]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const handleRefresh = () => { refresh(); setRefreshKey(k => k + 1); };

  const getWalletBalance = (currency: string) => {
    const w = wallets.find(x => (x.asset || '').toUpperCase() === currency.toUpperCase());
    return {
      balance: parseFloat(String(w?.balance ?? 0)) || 0,
      available: parseFloat(String(w?.available ?? w?.balance ?? 0)) || 0,
      pending: 0, // WalletEntry uses available/locked — no pending field
      address: w?.address,
      network: w?.network,
    };
  };

  const toUSD = (amount: number, currency: string) => {
    if (currency === 'USD') return amount;
    const r = rates[currency];
    if (!r || r <= 0) return 0;
    return amount * r;
  };

  const ngnRate = rates['NGN'] || 0.00066; // NGN price in USD
  const fiatWalletsInfo = fiatCatalog.map(c => ({ currency: c.code, symbol: c.symbol, balance: getWalletBalance(c.code).balance, flag: c.flag, color: c.color }));
  const cryptoWalletsInfo = cryptoCatalog.map(c => ({ currency: c.code, symbol: c.symbol, balance: getWalletBalance(c.code).balance, flag: c.flag, color: c.color }));

  // fiat wallets for portfolio summary
  const fiatWalletsForPortfolio = fiatCatalog.map(c => {
    const b = getWalletBalance(c.code);
    return { currency: c.code, balance: b.balance, balances: { available: b.available, pending: b.pending, locked: 0 } };
  });
  const cryptoWalletsForPortfolio = cryptoCatalog.map(c => {
    const b = getWalletBalance(c.code);
    return { currency: c.code, balance: b.balance, balances: { available: b.available, pending: b.pending, locked: 0 } };
  });

  const openModal = (type: 'fund' | 'withdraw' | 'transfer' | 'receive' | 'buy', currency: string, network = 'native') => {
    setSelectedAsset({ currency, network });
    if (type === 'fund') { setIsBuyMode(false); setShowFundModal(true); }
    else if (type === 'buy') { setIsBuyMode(true); setShowFundModal(true); }
    else if (type === 'withdraw') setShowWithdrawModal(true);
    else if (type === 'transfer') setShowTransferModal(true);
    else if (type === 'receive') setShowReceiveModal(true);
  };

  const handleCreateWallet = async (currency: string) => {
    try {
      await createWallet(currency);
      toast.success(`${currency} wallet activated!`);
      setShowCreateModal(false);
      handleRefresh();
    } catch { /* handled */ }
  };

  // Group Fiat Catalog into Fiat Banking vs Digital Currency vs Coming Soon
  const visibleCurrencies = CurrencyFeatureService.getVisibleCurrencies();
  const STABLECOIN_CODES = new Set(['USDT', 'USDC', 'CNGN']);
  const activeBankingFiat = fiatCatalog.filter(c => c.status === 'active' && !STABLECOIN_CODES.has(c.code) && visibleCurrencies.includes(c.code));
  const digitalCurrencies = fiatCatalog.filter(c => c.status === 'active' && STABLECOIN_CODES.has(c.code) && visibleCurrencies.includes(c.code));
  const comingSoonFiatCurrencies = fiatCatalog.filter(c => c.status === 'coming_soon' && visibleCurrencies.includes(c.code));

  // Currencies available to create in modal
  const availableToCreate = fiatCatalog.filter(c => visibleCurrencies.includes(c.code) && !wallets.some(w => (w.asset || '').toUpperCase() === c.code));

  return (
    <div className="min-h-screen text-white" style={{ background: '#060611' }}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

        {/* ── Page Header ────────────────────────────────────────────── */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black bg-clip-text text-transparent"
              style={{ backgroundImage: 'linear-gradient(135deg, #fff 0%, #a5b4fc 100%)' }}>
              Wallet Hub
            </h1>
            <p className="text-gray-400 text-sm mt-0.5">Unified multi-currency treasury & wallet management</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowCreateModal(true)}
              variant="outline"
              size="sm"
              className="hidden sm:flex border-white/10 hover:border-indigo-500/50 text-gray-300"
            >
              <Plus size={15} className="mr-1.5" /> Add Currency
            </Button>
            <Button onClick={handleRefresh} variant="ghost" size="sm" className="bg-white/5 hover:bg-white/10">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>

        {/* ── Portfolio Dashboard ────────────────────────────────────── */}
        <PortfolioDashboard
          fiatWallets={fiatWalletsForPortfolio}
          cryptoWallets={cryptoWalletsForPortfolio}
          rates={rates}
          ngnRate={ngnRate}
          loading={loading}
          showBalances={showBalances}
          onToggleBalances={() => setShowBalances(b => !b)}
        />

        {/* ── Tab Navigation ─────────────────────────────────────────── */}
        <WalletHubTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {/* ── Tab Panels ────────────────────────────────────────────── */}
        <AnimatePresence mode="wait">
          {/* ── FIAT BANKING TAB ──────────────────────────────────── */}
          {activeTab === 'fiat' && (
            <motion.div
              key="fiat"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="space-y-8"
            >
              {/* ── SECTION 1: AVAILABLE NOW ──────────────────────────── */}
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                    <h2 className="text-lg font-bold text-white tracking-wide font-mono uppercase text-xs tracking-wider">Fiat Banking Currencies</h2>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                      {activeBankingFiat.length} Active Currencies
                    </span>
                  </div>
                  <span className="text-xs text-gray-500 hidden sm:inline">
                    Licensed Banking Partners
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {activeBankingFiat.map(currency => {
                    const balData = getWalletBalance(currency.code);
                    return (
                      <FiatWalletCard
                        key={currency.code}
                        currency={currency}
                        balance={balData.balance}
                        availableBalance={balData.available}
                        pendingBalance={balData.pending}
                        showBalance={showBalances}
                        isSelected={selectedAsset.currency === currency.code}
                        onSelect={() => setSelectedAsset({ currency: currency.code, network: 'native' })}
                        onDeposit={() => openModal('fund', currency.code)}
                        onWithdraw={() => openModal('withdraw', currency.code)}
                        onTransfer={() => openModal('transfer', currency.code)}
                        onConvert={() => { setActiveTab('exchange'); }}
                        onBuyCrypto={() => { setActiveTab('exchange'); }}
                      />
                    );
                  })}
                </div>
              </div>

              {/* ── SECTION 2: COMING SOON ────────────────────────────── */}
              <div className="space-y-4 pt-4">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Clock size={18} className="text-amber-400 shrink-0" />
                    <h2 className="text-lg font-bold text-white tracking-wide">Coming Soon</h2>
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/25">
                      {comingSoonFiatCurrencies.length} Supported International Currencies
                    </span>
                  </div>
                  <span className="text-xs text-amber-400/90 font-medium">
                    Available after banking partner activation
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {comingSoonFiatCurrencies.map(currency => {
                    const balData = getWalletBalance(currency.code);
                    return (
                      <FiatWalletCard
                        key={currency.code}
                        currency={currency}
                        balance={balData.balance}
                        availableBalance={balData.available}
                        pendingBalance={balData.pending}
                        showBalance={showBalances}
                        isSelected={selectedAsset.currency === currency.code}
                        onSelect={() => setSelectedAsset({ currency: currency.code, network: 'native' })}
                      />
                    );
                  })}
                </div>
              </div>

              {selectedAsset.currency && activeBankingFiat.some(c => c.code === selectedAsset.currency) && (
                <VirtualAccountDetails 
                  currency={selectedAsset.currency} 
                  onAccountCreated={handleRefresh}
                />
              )}
            </motion.div>
          )}

          {/* ── DIGITAL CURRENCY TAB ──────────────────────────────────── */}
          {activeTab === 'digital' && (
            <motion.div
              key="digital"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {/* Digital Currency Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-900/20 via-indigo-900/20 to-gray-900 border border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 font-bold text-lg">
                    ₮
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">Digital Currency & Stablecoins</h2>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                        Licensed Settlement Partner
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">Settlement stablecoins & digital naira — fiat settlement layer (separate from on-chain crypto custody).</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {digitalCurrencies.map(currency => {
                  const balData = getWalletBalance(currency.code);
                  return (
                    <FiatWalletCard
                      key={currency.code}
                      currency={currency}
                      balance={balData.balance}
                      availableBalance={balData.available}
                      pendingBalance={balData.pending}
                      showBalance={showBalances}
                      isSelected={selectedAsset.currency === currency.code}
                      onSelect={() => setSelectedAsset({ currency: currency.code, network: 'native' })}
                      onDeposit={() => openModal('fund', currency.code)}
                      onWithdraw={() => openModal('withdraw', currency.code)}
                      onTransfer={() => openModal('transfer', currency.code)}
                      onConvert={() => { setActiveTab('exchange'); }}
                      onBuyCrypto={() => { setActiveTab('exchange'); }}
                    />
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── ON-CHAIN CRYPTO WALLETS TAB ───────────────────────── */}
          {activeTab === 'crypto' && (
            <motion.div
              key="crypto"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              {/* Crypto Header */}
              <div className="p-4 rounded-2xl bg-gradient-to-r from-purple-900/20 via-indigo-900/20 to-gray-900 border border-purple-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold">
                    ₿
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-white">Blockchain Cryptocurrencies</h2>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-purple-500/15 text-purple-300 border border-purple-500/30">
                        Licensed Custody Partner
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">On-chain blockchain deposits, confirmations, network fees, & wallet addresses.</p>
                  </div>
                </div>
                <div className="px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-medium flex items-center gap-1.5">
                  <ShieldAlert size={14} className="text-amber-400 shrink-0" />
                  <span>On-Chain Custody Integration Coming Soon</span>
                </div>
              </div>

              <div className="space-y-3">
                {cryptoCatalog.map(currency => {
                  const balData = getWalletBalance(currency.code);
                  const usdVal = toUSD(balData.balance, currency.code);
                  return (
                    <CryptoWalletCard
                      key={currency.code}
                      currency={currency}
                      balance={balData.balance}
                      availableBalance={balData.available}
                      address={balData.address}
                      network={balData.network}
                      usdValue={usdVal}
                      ngnValue={usdVal / ngnRate}
                      showBalance={showBalances}
                      isSelected={selectedAsset.currency === currency.code}
                      isExpanded={expandedCrypto === currency.code}
                      onSelect={() => setSelectedAsset({ currency: currency.code, network: balData.network || 'native' })}
                      onToggleExpand={() => setExpandedCrypto(prev => prev === currency.code ? null : currency.code)}
                      onDeposit={() => openModal('receive', currency.code, balData.network || 'native')}
                      onWithdraw={() => openModal('withdraw', currency.code, balData.network || 'native')}
                      onSend={() => openModal('transfer', currency.code)}
                      onSwap={() => setActiveTab('exchange')}
                      onBuyWithFiat={() => { setActiveTab('exchange'); }}
                      onSellToFiat={() => { setActiveTab('exchange'); }}
                    />
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── EXCHANGE HUB TAB ──────────────────────────────────── */}
          {activeTab === 'exchange' && (
            <motion.div
              key="exchange"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
            >
              <ExchangeHub
                fiatWallets={fiatWalletsInfo.filter(w => fiatCatalog.some(c => c.status === 'active' && c.code === w.currency))}
                cryptoWallets={cryptoWalletsInfo}
                rates={rates}
                lastUsedFiatCurrency={lastBuyFiat}
                onSuccess={() => { handleRefresh(); }}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Recent Activity ─────────────────────────────────────── */}
        <div>
          <h2 className="text-base font-bold text-white mb-3 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 inline-block" />
            Recent Activity
          </h2>
          <RecentActivity refreshKey={refreshKey} limit={15} />
        </div>

      </div>

      {/* ── Modals ───────────────────────────────────────────────────── */}
      {showFundModal && (
        <FundModal
          isOpen={showFundModal}
          onClose={() => { setShowFundModal(false); setIsBuyMode(false); }}
          selectedCurrency={selectedAsset.currency}
          selectedNetwork={selectedAsset.network}
          onSuccess={handleRefresh}
          initialIsPurchase={isBuyMode}
        />
      )}
      {showTransferModal && (
        <TransferModal
          isOpen={showTransferModal}
          onClose={() => setShowTransferModal(false)}
          selectedCurrency={selectedAsset.currency}
          selectedNetwork={selectedAsset.network}
          onSuccess={handleRefresh}
        />
      )}
      {showWithdrawModal && (
        <WithdrawModal
          isOpen={showWithdrawModal}
          onClose={() => setShowWithdrawModal(false)}
          selectedCurrency={selectedAsset.currency}
          selectedNetwork={selectedAsset.network}
          onSuccess={() => { handleRefresh(); toast.success('Withdrawal initiated'); }}
        />
      )}
      {showReceiveModal && (
        <ReceiveModal
          isOpen={showReceiveModal}
          onClose={() => setShowReceiveModal(false)}
          initialCurrency={selectedAsset.currency}
          initialNetwork={selectedAsset.network}
        />
      )}

      {/* ── Add Wallet Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="modal-overlay p-4 z-50"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="modal-content w-full max-w-lg bg-gray-900 border border-white/10 p-6 rounded-3xl"
            >
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
              <h2 className="text-xl font-bold mb-1 text-white">Add New Currency Wallet</h2>
              <p className="text-gray-400 text-sm mb-6">Select a currency to activate your wallet balance</p>
              {availableToCreate.length === 0 ? (
                <p className="text-center text-gray-500 py-6">All available wallets are already active.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-96 overflow-y-auto pr-1">
                  {availableToCreate.map(c => (
                    <button
                      key={c.code}
                      onClick={() => handleCreateWallet(c.code)}
                      className={`p-4 border rounded-2xl transition-all flex flex-col items-center gap-2 text-center ${
                        c.status === 'active'
                          ? 'border-white/10 hover:border-indigo-500/50 hover:bg-white/5 cursor-pointer'
                          : 'border-white/5 bg-white/5 opacity-60 cursor-not-allowed'
                      }`}
                    >
                      <span className="text-3xl">{c.flag}</span>
                      <span className="font-bold text-white text-sm">{c.code}</span>
                      <span className="text-gray-400 text-xs truncate max-w-full">{c.name}</span>
                      {c.status === 'active' ? (
                        <span className="text-[10px] text-emerald-400 font-semibold">Active</span>
                      ) : (
                        <span className="text-[10px] text-amber-400 font-semibold">Coming Soon</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function WalletPage() {
  return (
    <ErrorBoundary fallback={
      <div className="p-8 text-center text-red-400 bg-red-500/5 rounded-2xl border border-red-500/10 m-6">
        Something went wrong loading your wallet.
        <button onClick={() => window.location.reload()} className="underline ml-2 hover:text-red-300">
          Try again
        </button>
      </div>
    }>
      <WalletHubContent />
    </ErrorBoundary>
  );
}
