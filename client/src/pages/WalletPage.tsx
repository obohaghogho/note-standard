import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useWallet } from '../hooks/useWallet';
import { useSocket } from '../context/SocketContext';
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
import { formatCurrency } from '../lib/CurrencyFormatter';
import toast from 'react-hot-toast';

const SUPPORTED_CURRENCIES = ['BTC', 'ETH', 'USD', 'NGN', 'EUR', 'GBP', 'JPY'];

export const WalletPage: React.FC = () => {
    const { wallets, transactions, loading, refresh, createWallet } = useWallet();
    const { socket } = useSocket();
    
    // Force-refresh service data on mount (ensures fresh data after activity redirect)
    useEffect(() => {
        refresh();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    
    const safeTransactions = Array.isArray(transactions) ? transactions : [];
    
    const [rates, setRates] = useState<Record<string, number>>({}); // Rates in USD
    const [totalBalance, setTotalBalance] = useState(0);
    const [totalAvailableBalance, setTotalAvailableBalance] = useState(0);
    const [ratesLoading, setRatesLoading] = useState(true);
    const [refreshKey, setRefreshKey] = useState(0);
    const [showBalances, setShowBalances] = useState(true);
    const [searchParams, setSearchParams] = useSearchParams();

    // Instant Proactive Polling for external redirects (e.g. Flutterwave/Paystack)
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
                } catch (err) {
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

    // Stats
    const swapCardRef = useRef<HTMLDivElement>(null);

    // Fetch Rates & Calculate Total
    useEffect(() => {
        const processExchangeRates = (exchangeRates: Record<string, any>) => {
            const usdRates: Record<string, number> = {};
            
            Object.keys(exchangeRates).forEach(curr => {
                let val = exchangeRates[curr];
                
                // Handle objects (old provider format)
                if (typeof val === 'object' && val !== null) {
                    val = val['USD'] || val[curr] || 0;
                }

                const numVal = typeof val === 'string' ? parseFloat(val) : val;
                
                if (typeof numVal === 'number' && !isNaN(numVal) && numVal > 0) {
                    // Convert "1 USD = X Currency" to "1 Currency = Y USD"
                    usdRates[curr] = 1 / numVal;
                }
            });

            usdRates['USD'] = 1;
            setRates(usdRates);
            setRatesLoading(false);
        };

        const fetchRates = async () => {
            setRatesLoading(true);
            try {
                const exchangeRates = await walletApi.getExchangeRates();
                processExchangeRates(exchangeRates);
            } catch (err) {
                console.error('Failed to fetch rates', err);
                setRatesLoading(false);
            }
        };

        // Initial fetch
        if (Array.isArray(wallets) && wallets.length > 0) {
            fetchRates();
        }

        // Socket.io Listener: Active Real-time Overwrite
        if (socket) {
            socket.on('rates_updated', (newRates: any) => {
                console.log('[Socket] Rates updated in real-time');
                processExchangeRates(newRates);
            });

            return () => {
                socket.off('rates_updated');
            };
        }
    }, [wallets.length, socket]);

    // Calculate Total Balance & Available Balance
    useEffect(() => {
        if (wallets.length > 0 && Object.keys(rates).length > 0) {
            let total = 0;
            let available = 0;
            const safeWallets = Array.isArray(wallets) ? wallets : [];
            
            safeWallets.forEach(w => {
                const rate = rates[w.currency] || 0;
                // Using a slightly more robust multiplication to reduce float noise
                const balValue = Number((w.balance * rate).toFixed(12));
                const availValue = Number(((w.available_balance ?? w.balance) * rate).toFixed(12));
                
                total += balValue;
                available += availValue;
            });

            setTotalBalance(Number(total.toFixed(8)));
            setTotalAvailableBalance(Number(available.toFixed(8)));
        }
    }, [wallets, rates]);

    const handleAction = (action: 'send' | 'receive' | 'fund' | 'withdraw' | 'swap' | 'buy') => {
        const safeWallets = Array.isArray(wallets) ? wallets : [];
        if (!selectedAsset.currency && safeWallets.length > 0) {
            // Prefer a fiat wallet as default for global actions (better feature discoverability)
            const fiatWallet = safeWallets.find(w => ['USD', 'EUR', 'NGN', 'GBP'].includes(w.currency));
            const defaultWallet = fiatWallet || safeWallets[0];
            setSelectedAsset({ currency: defaultWallet.currency, network: defaultWallet.network });
        }

        switch (action) {
            case 'fund':
                setShowFundModal(true);
                break;
            case 'buy':
                // For buy action, default to a crypto wallet to trigger direct purchase
                if (['USD', 'EUR', 'NGN', 'GBP'].includes(selectedAsset.currency)) {
                    const cryptoWallet = safeWallets.find(w => !['USD', 'EUR', 'NGN', 'GBP'].includes(w.currency));
                    if (cryptoWallet) {
                        setSelectedAsset({ currency: cryptoWallet.currency, network: cryptoWallet.network });
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
            toast.success(`${currency} service activated!`);
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
                
                {/* Market Price Ticker */}
                {!loading && Object.keys(rates).length > 0 && (
                    <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-none no-scrollbar">
                        {['BTC', 'ETH'].map(curr => (
                            <div key={curr} className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full shrink-0">
                                <span className={`w-2 h-2 rounded-full bg-green-400 animate-pulse`} />
                                <span className="text-xs font-bold text-gray-300">{curr}/USD</span>
                                <span className="text-xs font-black text-white">
                                    { (rates[curr] || 0) < 0.01 
                                        ? `$${(rates[curr] || 0).toFixed((rates[curr] || 0) < 0.0001 ? 6 : 4)}` 
                                        : formatCurrency(rates[curr] || 0, 'USD') 
                                    }
                                </span>
                            </div>
                        ))}
                    </div>
                )}

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
                            onBuy={() => handleAction('buy')}
                            disabledActions={
                                ['BTC', 'ETH', 'USDT', 'USDC'].some(c => selectedAsset.currency?.startsWith(c)) 
                                ? ['Deposit'] 
                                : []
                            }
                        />
                         
                         {/* Wallet List (Breakdown) */}
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
                                    initialFromNetwork={selectedAsset.network}
                                    onSuccess={() => {
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
                        transactions={safeTransactions} 
                        loading={loading}
                     />
                </div>

            </div>

            {/* Modals */}
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
                        toast.success('Transfer successful');
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

            {/* Create Service Modal */}
             {showCreateModal && (
                <div className="modal-overlay p-4">
                  <div className="modal-content w-full max-w-lg">

                    <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                      <X size={20} />
                    </button>
                    <h2 className="text-xl font-bold mb-6">Add New Service</h2>
                    
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
                          <p className="col-span-2 text-center text-gray-500 py-4">All available services active.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}
        </div>
    );
};
