import React, { useState, useEffect, useRef } from 'react';
import { useWallet } from '../../hooks/useWallet';
import { walletApi } from '../../lib/walletApi';
import { WalletBalanceCard } from '../../components/wallet/WalletBalanceCard';
import { ActionsGrid } from '../../components/wallet/ActionsGrid';
import { CurrencyList } from '../../components/wallet/CurrencyList';
import { SwapCard } from '../../components/wallet/SwapCard';
import { TransactionHistory } from '../../components/wallet/TransactionHistory';
import { FundModal } from '../../components/wallet/FundModal';
import { TransferModal } from '../../components/wallet/TransferModal';
import { WithdrawModal } from '../../components/wallet/WithdrawModal';
import { ReceiveModal } from '../../components/wallet/ReceiveModal';
import { WalletAllocationChart } from '../../components/wallet/WalletAllocationChart';
import { RefreshCw, Plus, X, Loader2 } from 'lucide-react';
import { Button } from '../../components/common/Button';
import toast from 'react-hot-toast';

const SUPPORTED_CURRENCIES = ['BTC', 'ETH', 'USD', 'NGN', 'EUR', 'GBP', 'JPY'];

export const WalletPage: React.FC = () => {
    const { wallets, transactions, loading, refresh, createWallet } = useWallet();
    const [rates, setRates] = useState<Record<string, number>>({}); // Rates in USD
    const [totalBalance, setTotalBalance] = useState(0);
    const [ratesLoading, setRatesLoading] = useState(true);

    // Modals
    const [showFundModal, setShowFundModal] = useState(false);
    const [showTransferModal, setShowTransferModal] = useState(false);
    const [showWithdrawModal, setShowWithdrawModal] = useState(false);
    const [showReceiveModal, setShowReceiveModal] = useState(false);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [selectedCurrency, setSelectedCurrency] = useState<string>('BTC');

    // Stats
    const swapCardRef = useRef<HTMLDivElement>(null);

    // Fetch Rates & Calculate Total
    useEffect(() => {
        const fetchRates = async () => {
            setRatesLoading(true);
            try {
                const exchangeRates = await walletApi.getExchangeRates();
                // Normalize rates to USD
                // exchangeRates structure: { "BTC": { "USD": 95000, ... }, "USD": { "BTC": 0.00001, ... } }
                
                const usdRates: Record<string, number> = {};
                Object.keys(exchangeRates).forEach(curr => {
                    usdRates[curr] = exchangeRates[curr]?.['USD'] || (curr === 'USD' ? 1 : 0);
                });

                // Fallback for missing rates (e.g. if API fails partially)
                usdRates['USD'] = 1;
                
                setRates(usdRates);
            } catch (err) {
                console.error('Failed to fetch rates', err);
            } finally {
                setRatesLoading(false);
            }
        };

        if (wallets.length > 0) {
            fetchRates();
            // Poll rates every 60 seconds
            const interval = setInterval(fetchRates, 60000);
            return () => clearInterval(interval);
        }
    }, [wallets.length]);

    // Calculate Total Balance
    useEffect(() => {
        if (wallets.length > 0 && Object.keys(rates).length > 0) {
            let total = 0;
            wallets.forEach(w => {
                const rate = rates[w.currency] || 0;
                total += w.balance * rate;
            });
            setTotalBalance(total);
        }
    }, [wallets, rates]);

    const handleAction = (action: 'send' | 'receive' | 'fund' | 'withdraw' | 'swap') => {
        // Default currency selection if none selected (usually BTC or first available)
        if (!selectedCurrency && wallets.length > 0) setSelectedCurrency(wallets[0].currency);

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
                // Scroll to swap card
                swapCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // If it's effectively hidden or far down, maybe focus it
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
                        <Button onClick={refresh} variant="ghost" size="sm" className="bg-gray-800 hover:bg-gray-700">
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
                            currency="USD"
                            loading={ratesLoading || loading}
                        />

                        {/* Quick Actions (Mobile/Desktop) */}
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
                                    onSelect={(curr) => setSelectedCurrency(curr)}
                                />
                            )}
                        </div>
                    </div>

                    {/* Right: Swap Module (Sticky on desktop) */}
                    <div className="lg:col-span-1">
                        <div className="sticky top-6">
                           <div ref={swapCardRef}>
                                <SwapCard 
                                    initialFromCurrency={selectedCurrency} 
                                    onSuccess={() => {
                                        refresh();
                                        toast.success('Balance updated');
                                    }}
                                />
                           </div>
                           
                           {/* Quick Market Stats or Mini-History could go here */}
                           {/* Allocation Chart */}
                           <div className="mt-6">
                                <WalletAllocationChart wallets={wallets} rates={rates} />
                           </div>
                        </div>
                    </div>
                </div>

                {/* Bottom Section: Transaction History */}
                <div className="pb-12">
                     <TransactionHistory transactions={transactions} />
                </div>

            </div>

            {/* Modals */}
            <FundModal 
                isOpen={showFundModal} 
                onClose={() => setShowFundModal(false)} 
                selectedCurrency={selectedCurrency}
                onSuccess={refresh}
            />
             <TransferModal
                isOpen={showTransferModal}
                onClose={() => setShowTransferModal(false)}
                selectedCurrency={selectedCurrency}
                onSuccess={() => {
                    refresh();
                    toast.success('Transfer successful');
                }}
            />
            <WithdrawModal
                isOpen={showWithdrawModal}
                onClose={() => setShowWithdrawModal(false)}
                selectedCurrency={selectedCurrency}
                onSuccess={() => {
                    refresh();
                    toast.success('Withdrawal initiated');
                }}
            />
            <ReceiveModal
                isOpen={showReceiveModal}
                onClose={() => setShowReceiveModal(false)}
                initialCurrency={selectedCurrency}
            />

            {/* Create Wallet Modal (keep simple inline for now or extract) */}
             {showCreateModal && (
                <div className="modal-overlay p-4">
                  <div className="modal-content w-full max-w-lg">

                    <button className="modal-close" onClick={() => setShowCreateModal(false)}>
                      <X size={20} />
                    </button>
                    <h2 className="text-xl font-bold mb-6">Add New Wallet</h2>
                    
                    <div className="grid grid-cols-2 gap-4">
                      {SUPPORTED_CURRENCIES.map((curr) => {
                        const exists = wallets.some(w => w.currency === curr);
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
