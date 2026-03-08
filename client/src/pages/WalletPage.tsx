import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
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
import { RefreshCw, Plus, X, Loader2 } from 'lucide-react';
import { Button } from '../components/common/Button';
import toast from 'react-hot-toast';

const SUPPORTED_CURRENCIES = ['BTC', 'ETH', 'USD', 'NGN', 'EUR', 'GBP', 'JPY'];

export const WalletPage: React.FC = () => {
    const { wallets, transactions, loading, refresh, createWallet } = useWallet();
    
    // Force-refresh wallet data on mount (ensures fresh data after payment redirect)
    useEffect(() => {
        refresh();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    
    console.log("transactions:", transactions);
    console.log("isArray:", Array.isArray(transactions));

    const safeTransactions = Array.isArray(transactions) ? transactions : [];
    const completedTransactions = safeTransactions.filter(
        (tx) => tx.status?.toLowerCase() === "completed"
    );
    console.log("completed count:", completedTransactions.length);

    const [rates, setRates] = useState<Record<string, number>>({}); // Rates in USD
    const [totalBalance, setTotalBalance] = useState(0);
    const [totalAvailableBalance, setTotalAvailableBalance] = useState(0);
    const [ratesLoading, setRatesLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const [showBalances, setShowBalances] = useState(true);
    const [searchParams, setSearchParams] = useSearchParams();

    // Instant Proactive Polling for external redirects (e.g. Flutterwave)
    useEffect(() => {
        const txRef = searchParams.get('tx_ref');
        const transactionId = searchParams.get('transaction_id');
        const statusParam = searchParams.get('status');

        if (txRef && statusParam) {
            let isActive = true;
            const verifyPayment = async () => {
                const toastId = toast.loading('Verifying your payment...', { duration: 10000 });
                try {
                    const res = await walletApi.proactiveVerifyPayment(txRef, transactionId || undefined);
                    if (!isActive) return;

                    if (['COMPLETED', 'SUCCESS', 'SUCCESSFUL', 'success'].includes(res.status?.toUpperCase() || '')) {
                        toast.success('Payment verified successfully!', { id: toastId });
                        setSearchParams({});
                        await refresh();
                        setRefreshKey(k => k + 1);
                    } else if (['FAILED', 'CANCELLED'].includes(res.status?.toUpperCase() || '')) {
                        toast.error('Payment failed or was cancelled.', { id: toastId });
                        setSearchParams({});
                    } else {
                        toast.success('Payment is pending. Tracking your transaction...', { id: toastId });
                        setSearchParams({});
                        await refresh();
                    }
                } catch (err) {
                    if (isActive) {
                        toast.error('Payment confirmation delayed. Balance will update shortly.', { id: toastId });
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
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [showReceiveModal, setShowReceiveModal] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState<{ currency: string; network: string }>({ currency: 'BTC', network: 'native' });

    // Stats
    const swapCardRef = useRef<HTMLDivElement>(null);

    // Fetch Rates & Calculate Total
    useEffect(() => {
        const fetchRates = async () => {
            setRatesLoading(true);
            try {
                const exchangeRates = await walletApi.getExchangeRates();
                
                const usdRates: Record<string, number> = {};
                
                Object.keys(exchangeRates).forEach(curr => {
                    const val = exchangeRates[curr];
                    if (typeof val === 'number') {
                        usdRates[curr] = val > 0 ? 1 / val : 0;
                    } else if (typeof val === 'object' && val !== null) {
                        usdRates[curr] = val['USD'] || 0;
                    }
                });

                usdRates['USD'] = 1;
                
                setRates(usdRates);
            } catch (err) {
                console.error('Failed to fetch rates', err);
            } finally {
                setRatesLoading(false);
            }
        };

        if (Array.isArray(wallets) && wallets.length > 0) {
            fetchRates();
            const interval = setInterval(fetchRates, 60000);
            return () => clearInterval(interval);
        }
    }, [wallets.length]);

    // Calculate Total Balance & Available Balance
    useEffect(() => {
        if (wallets.length > 0 && Object.keys(rates).length > 0) {
            let total = 0;
            let available = 0;
            const safeWallets = Array.isArray(wallets) ? wallets : [];
            safeWallets.forEach(w => {
                const rate = rates[w.currency] || 0;
                total += w.balance * rate;
                available += (w.available_balance ?? w.balance) * rate;
            });
            setTotalBalance(total);
            setTotalAvailableBalance(available);
        }
    }, [wallets, rates]);

    const handleAction = (action: 'send' | 'receive' | 'fund' | 'withdraw' | 'swap') => {
        const safeWallets = Array.isArray(wallets) ? wallets : [];
        if (!selectedAsset.currency && safeWallets.length > 0) {
            setSelectedAsset({ currency: safeWallets[0].currency, network: safeWallets[0].network });
        }

        switch (action) {
            case 'fund':
                setShowFundModal(true);
                break;
            case 'send':
                setShowTransferModal(true);
                break;
            case 'withdraw':
                setShowWithdrawModal(true);
                break;
            case 'swap':
                swapCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                break;
            case 'receive':
                setShowReceiveModal(true);
                break;
        }
    };

    const handleCreateWallet = async (currency: string) => {
        try {
            await createWallet(currency);
            toast.success(`${currency} wallet created!`);
            setShowCreateModal(false);
            refresh();
        } catch (err) {
           // handled in context
        }
    };

    const handleRefresh = () => {
        refresh();
        setRefreshKey(k => k + 1); // Trigger ledger trail refresh
    };

    return (
        <div className="min-h-[100dvh] bg-gray-950 text-white p-4 sm:p-6 lg:p-8 overflow-x-clip w-full">
            <div className="max-w-7xl mx-auto space-y-8">
                
                {/* Header */}
                <div className="flex justify-between items-center">
                    <div>
                        <h1 className="text-2xl sm:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">
                            Dashboard
                        </h1>
                        <p className="text-gray-400 text-sm mt-1">Manage your crypto and fiat assets</p>
                    </div>
                    <div className="flex gap-3">
                         <Button onClick={() => setShowCreateModal(true)} variant="outline" size="sm" className="hidden sm:flex border-gray-700 hover:border-purple-500">
                            <Plus size={16} className="mr-2" /> Add Wallet
                        </Button>
                        <Button onClick={handleRefresh} variant="ghost" size="sm" className="bg-gray-800 hover:bg-gray-700">
                            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
                        </Button>
                    </div>
                </div>

                {/* Top Section: Balance & Actions */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left: Balance Card */}
                    <div className="lg:col-span-2 space-y-6">
                        <WalletBalanceCard 
                            totalBalance={totalBalance} 
                            availableBalance={totalAvailableBalance}
                            currency="USD"
                            loading={ratesLoading || loading}
                            showBalance={showBalances}
                            onToggleBalance={() => setShowBalances(!showBalances)}
                        />

                        {/* Quick Actions */}
                        <ActionsGrid 
                            onSend={() => handleAction('send')}
                            onReceive={() => handleAction('receive')}
                            onSwap={() => handleAction('swap')}
                            onWithdraw={() => handleAction('withdraw')}
                            onDeposit={() => handleAction('fund')}
                        />
                         
                         {/* Wallet List (Breakdown) */}
                         <div>
                            <div className="flex justify-between items-center gap-4 mb-4 flex-wrap">
                                <h3 className="text-lg font-bold">Your Wallets</h3>
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
                                    wallets={wallets} 
                                    rates={rates} 
                                    onSelect={(curr, net) => setSelectedAsset({ currency: curr, network: net || 'native' })}
                                    showBalances={showBalances}
                                />
                            )}
                        </div>
                    </div>

                    {/* Right: Swap Module + Allocation Chart + Ledger Trail */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-6 space-y-6">
                           <div ref={swapCardRef}>
                                <SwapCard 
                                    initialFromCurrency={selectedAsset.currency} 
                                    initialFromNetwork={selectedAsset.network}                                    onSuccess={() => {
                                        handleRefresh();
                                        toast.success('Balance updated');
                                    }}
                                />
                           </div>
                           
                           {/* Allocation Chart */}
                           <WalletAllocationChart wallets={wallets} rates={rates} />

                           {/* Ledger Audit Trail */}
                           <LedgerTrail refreshKey={refreshKey} />
                        </div>
                    </div>
                </div>

                {/* Bottom Section: Transaction History */}
                <div className="pb-12">
                     <TransactionHistory 
                        transactions={transactions} 
                        loading={loading}
                     />
                </div>

            </div>

            {/* Modals */}
            <FundModal 
                isOpen={showFundModal} 
                onClose={() => setShowFundModal(false)} 
                selectedCurrency={selectedAsset.currency}
                selectedNetwork={selectedAsset.network}
                onSuccess={handleRefresh}
            />
             <TransferModal
                isOpen={showTransferModal}
                onClose={() => setShowTransferModal(false)}
                selectedCurrency={selectedAsset.currency}
                selectedNetwork={selectedAsset.network}
                onSuccess={() => {
                    handleRefresh();
                    toast.success('Transfer successful');
                }}
            />
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
            <ReceiveModal
                isOpen={showReceiveModal}
                onClose={() => setShowReceiveModal(false)}
                initialCurrency={selectedAsset.currency}
                initialNetwork={selectedAsset.network}
            />

            {/* Create Wallet Modal */}
             {showCreateModal && (
                <div className="modal-overlay p-4">
                  <div className="modal-content w-full max-w-lg">

                    <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                      <X size={20} />
                    </button>
                    <h2 className="text-xl font-bold mb-6">Add New Wallet</h2>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {(SUPPORTED_CURRENCIES ?? []).map((curr) => {
                        const exists = (wallets ?? []).some(w => w.currency === curr);
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
                      {wallets.length === SUPPORTED_CURRENCIES.length && (
                          <p className="col-span-2 text-center text-gray-500 py-4">All available wallets created.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
        </div>
    );
};
