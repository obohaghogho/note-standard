import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ErrorBoundary } from '../components/common/ErrorBoundary';
import { useWallet } from '../hooks/useWallet';
import walletApi from '../api/walletApi';
import { WalletBalanceCard } from '../components/WalletBalance';
import { ActionsGrid } from '../components/wallet/ActionsGrid';
import { CurrencyList } from '../components/wallet/CurrencyList';
import { SwapCard } from '../components/SwapCard';
import { TransactionHistory } from '../components/TransactionList';
import { FundModal } from '../components/wallet/FundModal';
import { TransferModal } from '../components/wallet/TransferModal';
import { WithdrawModal } from '../components/wallet/WithdrawModal';
import { ReceiveModal } from '../components/wallet/ReceiveModal';
import { WalletAllocationChart } from '../components/wallet/WalletAllocationChart';
import { LedgerTrail } from '../components/wallet/LedgerTrail';
import { BankAccountCard } from '../components/wallet/BankAccountCard';
import { RefreshCw, Plus, X, Loader2 } from 'lucide-react';
import { Button } from '../components/common/Button';
import toast from 'react-hot-toast';

const SUPPORTED_CURRENCIES = ['BTC', 'ETH', 'USD', 'NGN', 'EUR', 'GBP', 'JPY'];

function WalletContent() {
    const { wallets, financialView, transactions, loading, refresh, createWallet } = useWallet();

    // Live market rates for the ticker (independent of wallet balance)
    const [liveRates, setLiveRates] = useState<Record<string, number>>({});
    const [ratesLoading, setRatesLoading] = useState(true);

    useEffect(() => {
        let active = true;
        const fetchRates = async () => {
            try {
                setRatesLoading(true);
                const data = await walletApi.getExchangeRates();
                if (active && data?.rates) {
                    setLiveRates(data.rates);
                }
            } catch {
                // Silent — ticker stays loading
            } finally {
                if (active) setRatesLoading(false);
            }
        };
        fetchRates();
        // Refresh rates every 30s
        const interval = setInterval(fetchRates, 30000);
        return () => { active = false; clearInterval(interval); };
    }, []);

    // Force-refresh service data on mount
    useEffect(() => {
        refresh();
    }, [refresh]);
    
    const safeTransactions = Array.isArray(transactions) ? transactions : [];
    const [refreshKey, setRefreshKey] = useState(0);
    const [showBalances, setShowBalances] = useState(true);
    const [searchParams, setSearchParams] = useSearchParams();

    // Instant Proactive Polling for external redirects
    useEffect(() => {
        const txRef = searchParams.get('tx_ref');
        const reference = searchParams.get('reference');
        const transactionId = searchParams.get('transaction_id') || searchParams.get('flw_ref');
        const statusParam = searchParams.get('status');

        const refToVerify = txRef || reference;

        if (refToVerify && (statusParam || reference)) {
            let isActive = true;
            const verifyPayment = async () => {
                const toastId = toast.loading('Verifying your request...', { duration: 10000 });
                try {
                    const res = await walletApi.proactiveVerifyPayment(refToVerify, transactionId || undefined);
                    if (!isActive) return;

                    const upperStatus = (res.status || '').toUpperCase();
                    if (['COMPLETED', 'SUCCESS', 'SUCCESSFUL'].includes(upperStatus)) {
                        toast.success('Request processed successfully!', { id: toastId });
                        setSearchParams({});
                        await refresh();
                        setRefreshKey(k => k + 1);
                    } else if (['FAILED', 'CANCELLED'].includes(upperStatus)) {
                        toast.error('Request failed or was cancelled.', { id: toastId });
                        setSearchParams({});
                    } else {
                        toast.success('Request is pending. Tracking your activity...', { id: toastId });
                        setSearchParams({});
                        await refresh();
                    }
                } catch {
                    if (isActive) {
                        toast.error('Confirmation delayed. Status will update shortly.', { id: toastId });
                        setSearchParams({});
                    }
                }
            };
            verifyPayment();
            
            return () => { isActive = false; };
        }
    }, [searchParams, setSearchParams, refresh]);

    // Modals
    const [showFundModal, setShowFundModal] = useState(false);
    const [isBuyMode, setIsBuyMode] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [showReceiveModal, setShowReceiveModal] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<{ currency: string; network: string }>({ currency: 'BTC', network: 'native' });

    const swapCardRef = useRef<HTMLDivElement>(null);

    const handleAction = (action: 'send' | 'receive' | 'fund' | 'withdraw' | 'swap' | 'buy') => {
        const safeWallets = financialView.wallets || [];
        if (!selectedAsset.currency && safeWallets.length > 0) {
            const fiatWallet = safeWallets.find(w => ['USD', 'EUR', 'NGN', 'GBP'].includes(w.asset));
            const defaultWallet = fiatWallet || safeWallets[0];
            setSelectedAsset({ currency: defaultWallet.asset, network: defaultWallet.network || 'native' });
        }

        switch (action) {
            case 'fund':
                setShowFundModal(true);
                break;
            case 'buy':
                if (['USD', 'EUR', 'NGN', 'GBP'].includes(selectedAsset.currency)) {
                    const cryptoWallet = safeWallets.find(w => !['USD', 'EUR', 'NGN', 'GBP'].includes(w.asset));
                    if (cryptoWallet) {
                        setSelectedAsset({ currency: cryptoWallet.asset, network: cryptoWallet.network || 'native' });
                    }
                }
                setIsBuyMode(true);
                setShowFundModal(true);
                break;
            case 'send':
                setShowTransferModal(true);
                break;
            case 'withdraw':
                setShowWithdrawModal(true);
                break;
            case 'swap':
                if (swapCardRef.current) {
                    swapCardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    toast('Navigating to Exchange...', { icon: '🔄', duration: 1000 });
                } else {
                    toast.error('Exchange UI not found. Please refresh.');
                }
                break;
            case 'receive':
                setShowReceiveModal(true);
                break;
        }
    };

    const handleCreateWallet = async (currency: string) => {
        try {
            await createWallet(currency);
            toast.success(`${currency} service activated!`);
            setShowCreateModal(false);
            refresh();
        } catch {
           // handled in context
        }
    };

    const handleRefresh = () => {
        refresh();
        setRefreshKey(k => k + 1);
    };

    return (
        <div className="min-h-[100dvh] bg-gray-950 text-white p-4 sm:p-6 lg:p-8 overflow-x-clip w-full">
            <div className="max-w-7xl mx-auto space-y-8">
                
                {/* Market Price Ticker */}
                <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none no-scrollbar">
                    {['BTC', 'ETH'].map(curr => {
                        const price = liveRates[curr];
                        const isReady = !ratesLoading && price && price > 0;
                        const formattedPrice = isReady
                            ? `$${Number(price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : ratesLoading ? '...' : 'N/A';

                        return (
                            <div key={curr} className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full shrink-0">
                                <span className={`w-2 h-2 rounded-full ${
                                    isReady ? 'bg-green-400' : ratesLoading ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'
                                } animate-pulse`} />
                                <span className="text-xs font-bold text-gray-300">{curr}/USD</span>
                                <span className="text-xs font-black text-white">{formattedPrice}</span>
                            </div>
                        );
                    })}
                </div>

                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            Activity Overview
                        </h1>
                        <p className="text-gray-400 text-sm mt-1">Manage your digital activities and technology tools</p>
                    </div>
                    <div className="flex gap-3">
                         <Button onClick={() => setShowCreateModal(true)} variant="outline" size="sm" className="hidden sm:flex border-gray-700 hover:border-purple-500">
                            <Plus size={16} className="mr-2" /> Add Service
                        </Button>
                        <Button onClick={handleRefresh} variant="ghost" size="sm" className="bg-gray-800 hover:bg-gray-700">
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        </Button>
                    </div>
                </div>

                {/* Top Section */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-6">
                        <WalletBalanceCard 
                            totalBalance={financialView.totalBalanceValuation} 
                            availableBalance={financialView.totalAvailableValuation}
                            currency="USD"
                            loading={loading || !financialView.ratesReady}
                            showBalance={showBalances}
                            onToggleBalance={() => setShowBalances(!showBalances)}
                            evaluationId={financialView.evaluationId}
                            frozenAssets={financialView.frozenAssets}
                            systemStale={financialView.systemStale}
                        />

                        <ActionsGrid 
                            onSend={() => handleAction('send')}
                            onReceive={() => handleAction('receive')}
                            onSwap={() => handleAction('swap')}
                            onWithdraw={() => handleAction('withdraw')}
                            onDeposit={() => handleAction('fund')}
                            onBuy={() => handleAction('buy')}
                            disabledActions={
                                financialView.systemStale ? ['Swap', 'Withdraw'] : []
                            }
                        />
                         
                         <div>
                            <div className="flex justify-between items-center gap-4 mb-4 flex-wrap">
                                <h3 className="text-lg font-bold">Your Services</h3>
                                <button onClick={() => setShowCreateModal(true)} className="text-purple-400 text-sm hover:text-purple-300 sm:hidden">
                                    + Add New
                                </button>
                            </div>
                            {loading ? (
                                <div className="text-center py-10">
                                    <Loader2 className="animate-spin text-purple-500 mx-auto" size={32} />
                                </div>
                            ) : (
                                <CurrencyList 
                                    wallets={financialView.wallets} 
                                    onSelect={(curr, net) => setSelectedAsset({ currency: curr, network: net || 'native' })}
                                    showBalances={showBalances}
                                />
                            )}
                        </div>
                    </div>

                    <div className="lg:col-span-1">
                        <div className="sticky top-6 space-y-6">
                           <div ref={swapCardRef}>
                                <SwapCard 
                                    initialFromCurrency={selectedAsset.currency} 
                                    initialFromNetwork={selectedAsset.network}
                                    onSuccess={() => {
                                        handleRefresh();
                                        toast.success('Balance updated');
                                    }}
                                />
                           </div>

                           <BankAccountCard />
                           
                           <WalletAllocationChart wallets={wallets} rates={financialView.ratesReady ? {} : {}} /> 
                           <LedgerTrail refreshKey={refreshKey} />
                        </div>
                    </div>
                </div>

                <div className="pb-12">
                     <TransactionHistory 
                        transactions={safeTransactions} 
                        loading={loading}
                     />
                </div>

            </div>

            {showFundModal && (
                <FundModal 
                    isOpen={showFundModal} 
                    onClose={() => {
                        setShowFundModal(false);
                        setIsBuyMode(false);
                    }} 
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
                    onSuccess={() => {
                        handleRefresh();
                    }}
                />
            )}
            {showWithdrawModal && (
                <WithdrawModal
                    isOpen={showWithdrawModal}
                    onClose={() => setShowWithdrawModal(false)}
                    selectedCurrency={selectedAsset.currency}
                    selectedNetwork={selectedAsset.network}
                    onSuccess={() => {
                        handleRefresh();
                        toast.success('Withdrawal initiated');
                    }}
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

             {showCreateModal && (
                <div className="modal-overlay p-4">
                  <div className="modal-content w-full max-w-lg">
                    <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                      <X size={20} />
                    </button>
                    <h2 className="text-xl font-bold mb-6">Add New Service</h2>
                    <div className="grid grid-cols-2 gap-4">
                      {SUPPORTED_CURRENCIES.map((curr) => {
                        const exists = financialView.wallets.some(w => w.asset === curr);
                        if (exists) return null;
                        
                        return (
                          <button
                            key={curr}
                            onClick={() => handleCreateWallet(curr)}
                            className="p-4 border border-gray-700 rounded-xl hover:border-purple-500 hover:bg-gray-800 transition-all flex flex-col items-center gap-2 group"
                          >
                            <span className="text-2xl group-hover:scale-110 transition-transform">{curr === 'BTC' ? '₿' : curr === 'ETH' ? 'Ξ' : '$'}</span>
                            <span className="font-bold text-gray-300 group-hover:text-white">{curr}</span>
                          </button>
                        );
                      })}
                      {financialView.wallets.length === SUPPORTED_CURRENCIES.length && (
                          <p className="col-span-2 text-center text-gray-500 py-4">All available services active.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
        </div>
    );
}

export default function WalletPage() {
    return (
        <ErrorBoundary fallback={<div className="p-8 text-center text-red-500 bg-red-500/5 rounded-xl border border-red-500/10">Something went wrong loading your wallet. <button onClick={() => window.location.reload()} className="underline ml-2">Try again</button></div>}>
            <WalletContent />
        </ErrorBoundary>
    );
}
