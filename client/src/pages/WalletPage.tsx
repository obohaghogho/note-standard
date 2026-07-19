import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { RefreshCw, Plus, X, Loader2, Settings } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/common/Button';
import toast from 'react-hot-toast';

type HubTab = 'fiat' | 'crypto' | 'exchange';

// Default catalog — used if the API hasn't loaded yet
const DEFAULT_FIAT_CATALOG = [
  { code: 'NGN', name: 'Nigerian Naira', symbol: '₦', flag: '🇳🇬', color: '#6366f1', status: 'active', deposit_enabled: true, withdraw_enabled: true, transfer_enabled: true, buy_enabled: true, sell_enabled: true, convert_enabled: false, decimal_places: 2 },
  { code: 'USD', name: 'US Dollar', symbol: '$', flag: '🇺🇸', color: '#10b981', status: 'coming_soon', deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false, buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2 },
  { code: 'EUR', name: 'Euro', symbol: '€', flag: '🇪🇺', color: '#3b82f6', status: 'coming_soon', deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false, buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2 },
  { code: 'GBP', name: 'British Pound', symbol: '£', flag: '🇬🇧', color: '#ec4899', status: 'coming_soon', deposit_enabled: false, withdraw_enabled: false, transfer_enabled: false, buy_enabled: false, sell_enabled: false, convert_enabled: false, decimal_places: 2 },
];

const DEFAULT_CRYPTO_CATALOG = [
  { code: 'BTC', name: 'Bitcoin', symbol: '₿', flag: '🟠', color: '#f59e0b', status: 'active', deposit_enabled: true, withdraw_enabled: true, buy_enabled: true, sell_enabled: true, swap_enabled: true, decimal_places: 8, networks: ['bitcoin', 'BEP20'] },
  { code: 'ETH', name: 'Ethereum', symbol: 'Ξ', flag: '🔷', color: '#8b5cf6', status: 'active', deposit_enabled: true, withdraw_enabled: true, buy_enabled: true, sell_enabled: true, swap_enabled: true, decimal_places: 6, networks: ['ERC20', 'BEP20'] },
  { code: 'USDT', name: 'Tether', symbol: '₮', flag: '🟢', color: '#26a17b', status: 'active', deposit_enabled: true, withdraw_enabled: true, buy_enabled: true, sell_enabled: true, swap_enabled: true, decimal_places: 2, networks: ['TRC20', 'ERC20', 'BEP20'] },
  { code: 'USDC', name: 'USD Coin', symbol: '●', flag: '🔵', color: '#2775ca', status: 'active', deposit_enabled: true, withdraw_enabled: true, buy_enabled: true, sell_enabled: true, swap_enabled: true, decimal_places: 2, networks: ['ERC20', 'BEP20'] },
];

function WalletHubContent() {
  const { wallets, financialView, transactions, loading, refresh, createWallet } = useWallet();
  const [searchParams, setSearchParams] = useSearchParams();

  // Hub state
  const [activeTab, setActiveTab] = useState<HubTab>('fiat');
  const [showBalances, setShowBalances] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedCrypto, setExpandedCrypto] = useState<string | null>(null);

  // Catalog state (DB-first, fallback to defaults)
  const [fiatCatalog, setFiatCatalog] = useState(DEFAULT_FIAT_CATALOG);
  const [cryptoCatalog, setCryptoCatalog] = useState(DEFAULT_CRYPTO_CATALOG);

  // Live rates
  const [rates, setRates] = useState<Record<string, number>>({});
  const [ratesLoading, setRatesLoading] = useState(true);

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

  // ── Load catalog from DB ──────────────────────────────────────────────────
  useEffect(() => {
    walletApi.getCurrencies().then(catalog => {
      if (catalog.fiat?.length > 0) setFiatCatalog(catalog.fiat);
      if (catalog.crypto?.length > 0) setCryptoCatalog(catalog.crypto);
    }).catch(() => { /* use defaults */ });
  }, []);

  // ── Load exchange rates ───────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    const fetchRates = async () => {
      try {
        setRatesLoading(true);
        const data = await walletApi.getExchangeRates();
        if (active && data?.rates) setRates(data.rates);
      } catch { /* silent */ }
      finally { if (active) setRatesLoading(false); }
    };
    fetchRates();
    const iv = setInterval(fetchRates, 30000);
    return () => { active = false; clearInterval(iv); };
  }, []);

  // ── Refresh on mount ──────────────────────────────────────────────────────
  useEffect(() => { refresh(); }, [refresh]);

  // ── Auto-verify pending deposits ─────────────────────────────────────────
  useEffect(() => {
    const pendingRef = localStorage.getItem('pendingDepositReference');
    const pendingTime = localStorage.getItem('pendingDepositTime');
    if (!pendingRef || !pendingTime) return;
    if (Date.now() - parseInt(pendingTime, 10) > 30 * 60 * 1000) {
      localStorage.removeItem('pendingDepositReference');
      localStorage.removeItem('pendingDepositTime');
      return;
    }
    walletApi.proactiveVerifyPayment(pendingRef).then(res => {
      const s = (res?.status || '').toUpperCase();
      if (['COMPLETED', 'SUCCESS', 'SUCCESSFUL'].includes(s)) {
        localStorage.removeItem('pendingDepositReference');
        localStorage.removeItem('pendingDepositTime');
        refresh();
        toast.success('Deposit confirmed! Your wallet has been credited.');
      } else if (['FAILED', 'CANCELLED', 'REJECTED'].includes(s)) {
        localStorage.removeItem('pendingDepositReference');
        localStorage.removeItem('pendingDepositTime');
        toast.error('Your last payment could not be confirmed.');
      }
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handle redirect-back payment verification ─────────────────────────────
  useEffect(() => {
    const txRef = searchParams.get('tx_ref');
    const reference = searchParams.get('reference');
    const transactionId = searchParams.get('transaction_id') || searchParams.get('flw_ref');
    const statusParam = searchParams.get('status');
    const refToVerify = txRef || reference;
    if (refToVerify && (statusParam || reference)) {
      let isActive = true;
      const verify = async () => {
        const toastId = toast.loading('Verifying your payment...', { duration: 10000 });
        try {
          const res = await walletApi.proactiveVerifyPayment(refToVerify, transactionId || undefined);
          if (!isActive) return;
          const upper = (res.status || '').toUpperCase();
          if (['COMPLETED', 'SUCCESS', 'SUCCESSFUL'].includes(upper)) {
            toast.success('Payment confirmed!', { id: toastId });
          } else if (['FAILED', 'CANCELLED'].includes(upper)) {
            toast.error('Payment failed or cancelled.', { id: toastId });
          } else {
            toast.success('Payment pending — tracking...', { id: toastId });
          }
          setSearchParams({});
          await refresh();
          setRefreshKey(k => k + 1);
        } catch {
          if (isActive) { toast.error('Confirmation delayed.', { id: toastId }); setSearchParams({}); }
        }
      };
      verify();
      return () => { isActive = false; };
    }
  }, [searchParams, setSearchParams, refresh]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const handleRefresh = () => { refresh(); setRefreshKey(k => k + 1); };

  const getWalletBalance = (currency: string) => {
    const w = wallets.find(x => (x.currency || x.asset || '').toUpperCase() === currency.toUpperCase());
    return {
      balance: parseFloat(String(w?.balance || '0')) || 0,
      available: parseFloat(String(w?.balances?.available ?? w?.available_balance ?? w?.balance ?? '0')) || 0,
      pending: parseFloat(String(w?.balances?.pending ?? w?.pending_balance ?? '0')) || 0,
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

  // fiat wallets with balances for portfolio
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

  // All supported currencies not yet active in the user's wallets
  const availableToCreate = [...DEFAULT_FIAT_CATALOG, ...DEFAULT_CRYPTO_CATALOG]
    .filter(c => c.status === 'active' && !wallets.some(w => (w.currency || w.asset || '').toUpperCase() === c.code));

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
            <p className="text-gray-500 text-sm mt-0.5">Your unified financial command centre</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setShowCreateModal(true)}
              variant="outline"
              size="sm"
              className="hidden sm:flex border-white/10 hover:border-indigo-500/50 text-gray-300"
            >
              <Plus size={15} className="mr-1.5" /> Add Wallet
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
          {/* ── FIAT WALLETS TAB ──────────────────────────────────── */}
          {activeTab === 'fiat' && (
            <motion.div
              key="fiat"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="space-y-6"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {fiatCatalog.map(currency => {
                  const balData = getWalletBalance(currency.code);
                  return (
                    <FiatWalletCard
                      key={currency.code}
                      currency={currency as any}
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

              {selectedAsset.currency && ['NGN', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'].includes(selectedAsset.currency) && (
                <VirtualAccountDetails 
                  currency={selectedAsset.currency} 
                  onAccountCreated={handleRefresh}
                />
              )}
            </motion.div>
          )}

          {/* ── CRYPTO WALLETS TAB ────────────────────────────────── */}
          {activeTab === 'crypto' && (
            <motion.div
              key="crypto"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              {cryptoCatalog.map(currency => {
                const balData = getWalletBalance(currency.code);
                const usdVal = toUSD(balData.balance, currency.code);
                return (
                  <CryptoWalletCard
                    key={currency.code}
                    currency={currency as any}
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
                fiatWallets={fiatWalletsInfo.filter(w => fiatCatalog.find(c => c.code === w.currency)?.status === 'active')}
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
            className="modal-overlay p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="modal-content w-full max-w-lg"
            >
              <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                <X size={20} />
              </button>
              <h2 className="text-xl font-bold mb-1">Add New Wallet</h2>
              <p className="text-gray-400 text-sm mb-6">Activate a new currency wallet to start transacting</p>
              {availableToCreate.length === 0 ? (
                <p className="text-center text-gray-500 py-6">All available wallets are already active.</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {availableToCreate.map(c => (
                    <button
                      key={c.code}
                      onClick={() => handleCreateWallet(c.code)}
                      className="p-4 border border-white/5 rounded-2xl hover:border-indigo-500/40 hover:bg-white/5 transition-all flex flex-col items-center gap-2 group"
                    >
                      <span className="text-3xl group-hover:scale-110 transition-transform">{c.flag}</span>
                      <span className="font-bold text-white text-sm">{c.code}</span>
                      <span className="text-gray-500 text-xs">{c.name}</span>
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
