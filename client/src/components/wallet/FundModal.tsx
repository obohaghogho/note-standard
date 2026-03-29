import React, { useState, useEffect } from 'react';
import { X, CreditCard, Bitcoin, Copy, Loader2, ShieldCheck, CheckCircle2, Landmark, Zap, Lock } from 'lucide-react';
import { Button } from '../common/Button';
import walletApi from '../../api/walletApi';
import toast from 'react-hot-toast';
import type { Currency } from '@/types/wallet';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../hooks/useWallet';
import { ChevronDown } from 'lucide-react';

interface FundModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedCurrency: Currency;
    selectedNetwork?: string;
    onSuccess: () => void;
    initialIsPurchase?: boolean;
}

type DepositMethod = 'card' | 'bank' | 'crypto';

export const FundModal: React.FC<FundModalProps> = ({ 
    isOpen, 
    onClose, 
    selectedCurrency, 
    selectedNetwork = 'native',
    onSuccess: _onSuccess,
    initialIsPurchase = false
}) => {
    const { subscription } = useAuth();
    const { wallets } = useWallet();
    const [activeCurrency, setActiveCurrency] = useState<Currency>(selectedCurrency);
    const [activeNetwork, setActiveNetwork] = useState<string>(selectedNetwork);
    const [showAssetSelector, setShowAssetSelector] = useState(false);
    
    const [method, setMethod] = useState<DepositMethod>('card');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Bank deposit state
    const [bankDetails, setBankDetails] = useState<any>(null);

    // Crypto deposit state
    const [cryptoAddress, setCryptoAddress] = useState<{
        address: string;
        network?: string;
        minDeposit?: number;
        reference?: string;
        paymentUrl?: string;
    } | null>(null);
    const [cryptoStatus, setCryptoStatus] = useState<string>('PENDING');

    // Direct Purchase State
    const [isPurchase, setIsPurchase] = useState(initialIsPurchase);
    
    useEffect(() => {
        if (isOpen) {
            setIsPurchase(initialIsPurchase);
            if (initialIsPurchase) {
                setMethod('card');
            }
        }
    }, [initialIsPurchase, isOpen]);

    const [targetCurrency, setTargetCurrency] = useState<string>('USDT');
    const [targetNetwork] = useState<string>('native');

    const DAILY_LIMITS = {
        FREE: 1000,
        PRO: 10000,
        BUSINESS: 50000
    };
    const MAX_PER_TRANSACTION = 4000;

    const userPlan = (subscription?.plan_tier || 'FREE').toUpperCase() as keyof typeof DAILY_LIMITS;
    const dailyLimit = DAILY_LIMITS[userPlan] || DAILY_LIMITS.FREE;

    const isCrypto = activeCurrency === 'BTC' || activeCurrency === 'ETH' || activeCurrency.startsWith('USDT') || activeCurrency.startsWith('USDC');
    const isFiat = !isCrypto; 

    // For Crypto wallets acting as target, what fiat are they paying with?
    const [paymentFiat, setPaymentFiat] = useState<string>('USD');

    // Auto-detect if this is a cross-currency purchase flow
    const isEffectivelyPurchase = isPurchase || (isCrypto && (method === 'card' || method === 'bank'));
    const effectiveTargetCurrency = isEffectivelyPurchase ? (isCrypto ? activeCurrency : targetCurrency) : undefined;
    const effectiveTargetNetwork = isEffectivelyPurchase ? (isCrypto ? activeNetwork : targetNetwork) : undefined;
    const effectivePayCurrency = isCrypto && (method === 'card' || method === 'bank') ? paymentFiat : activeCurrency;

    useEffect(() => {
        // Reset state when modal opens or activeCurrency changes
        if (isOpen) {
            setBankDetails(null);
            setCryptoAddress(null);
            setCryptoStatus('PENDING');
            setMethod(isCrypto ? 'crypto' : 'card');
            setIsPurchase(false);
        }
    }, [isOpen, activeCurrency, isCrypto]);

    useEffect(() => {
        if (isOpen) {
            setActiveCurrency(selectedCurrency);
            setActiveNetwork(selectedNetwork);
            setAmount('');
        }
    }, [isOpen, selectedCurrency, selectedNetwork]);

    // Polling for crypto status
    useEffect(() => {
        let interval: any;
        if (cryptoAddress?.reference && cryptoStatus === 'PENDING') {
            interval = setInterval(async () => {
                try {
                    const status = await walletApi.checkPaymentStatus(cryptoAddress.reference!);
                    if (status.status === 'COMPLETED') {
                        setCryptoStatus('COMPLETED');
                        toast.success('Deposit confirmed!');
                        clearInterval(interval);
                        setTimeout(() => {
                            onClose();
                            _onSuccess();
                        }, 2000);
                    } else if (status.status === 'FAILED') {
                        setCryptoStatus('FAILED');
                        toast.error('Deposit failed');
                        clearInterval(interval);
                    }
                } catch (err) {
                    console.error('Polling error:', err);
                }
            }, 10000); // Poll every 10s
        }
        return () => clearInterval(interval);
    }, [cryptoAddress, cryptoStatus, onClose, _onSuccess]);

    const handleCryptoDeposit = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        const numAmount = parseFloat(amount);
        if (numAmount > dailyLimit) {
            toast.error(`Daily limit for ${userPlan} plan is ${dailyLimit} ${selectedCurrency}`);
            return;
        }

        if (numAmount > MAX_PER_TRANSACTION) {
            toast.error(`Maximum per transaction is ${MAX_PER_TRANSACTION} ${selectedCurrency}`);
            return;
        }

        setLoading(true);
        try {
            const result = await walletApi.initializePayment({
                amount: parseFloat(amount),
                currency: activeCurrency,
                provider: activeNetwork || 'native'
            });
            
            setCryptoAddress({
                address: result.payAddress || '',
                reference: result.reference,
                paymentUrl: result.paymentUrl,
                network: activeNetwork !== 'native' ? activeNetwork : (activeCurrency === 'BTC' ? 'Bitcoin' : 'Ethereum')
            });
            toast.success('Deposit address generated!');
        } catch (err: any) {
            toast.error(err.response?.data?.error || err.message || 'Failed to generate crypto address');
        } finally {
            setLoading(false);
        }
    };

    const handleRegenerateAddress = async () => {
        setLoading(true);
        try {
            const result = await walletApi.generateNewAddress(activeCurrency);
            setCryptoAddress({
                address: result.address,
                network: selectedCurrency.includes('_') ? selectedCurrency.split('_')[1] : (selectedCurrency === 'BTC' ? 'Bitcoin' : 'Ethereum (ERC20)'),
                reference: `mock_${Date.now()}`
            });
            setCryptoStatus('PENDING'); // Reset status for new address
            toast.success("New deposit address generated!");
        } catch (err: any) {
            toast.error(err.message || "Failed to generate new address");
        } finally {
            setLoading(false);
        }
    };

    const handleCardDeposit = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        const numAmount = parseFloat(amount);
        if (numAmount > dailyLimit) {
            toast.error(`Daily limit for ${userPlan} plan is ${dailyLimit} ${selectedCurrency}`);
            return;
        }

        if (numAmount > MAX_PER_TRANSACTION) {
            toast.error(`Maximum per transaction is ${MAX_PER_TRANSACTION} ${selectedCurrency}`);
            return;
        }

        setLoading(true);
        try {
            const result = await walletApi.depositCard({
                amount: Number(amount),
                currency: effectivePayCurrency,
                toCurrency: effectiveTargetCurrency,
                toNetwork: effectiveTargetNetwork,
            });
            
            // Store reference for later status check
            localStorage.setItem('pendingDepositReference', result.reference);
            localStorage.setItem('pendingDepositTime', Date.now().toString());
            
            if (result.checkoutUrl) {
                // Redirect to Stripe Checkout
                toast.loading('Redirecting to secure gateway...', { duration: 2000 });
                window.location.href = result.checkoutUrl;
            } else {
                toast.error('Payment initialization failed - no checkout URL received');
                setLoading(false);
            }
        } catch (err: any) {
            const message = err.response?.data?.error || err.message || 'Card deposit failed';
            if (message.includes('Unauthorized') || message.includes('401')) {
                toast.error('Session expired. Please refresh the page or log in again.');
            } else {
                toast.error(message);
            }
            setLoading(false);
        }
    };

    const handleBankDeposit = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        const numAmount = parseFloat(amount);
        if (numAmount > dailyLimit) {
            toast.error(`Daily limit for ${userPlan} plan is ${dailyLimit} ${selectedCurrency}`);
            return;
        }

        if (numAmount > MAX_PER_TRANSACTION) {
            toast.error(`Maximum per transaction is ${MAX_PER_TRANSACTION} ${selectedCurrency}`);
            return;
        }

        setLoading(true);
        try {
            const result = await walletApi.depositTransfer({
                amount: Number(amount),
                currency: effectivePayCurrency,
                toCurrency: effectiveTargetCurrency,
                toNetwork: effectiveTargetNetwork,
            });
            setBankDetails(result);
            toast.success('Service allocation details generated!');
        } catch (err: any) {
            toast.error(err.response?.data?.error || err.message || 'Failed to generate bank details');
        } finally {
            setLoading(false);
        }
    };

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success('Copied to clipboard!');
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <motion.div 
                initial={{ opacity: 0, scale: 0.95, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 20 }}
                className="modal-content max-w-[480px]"
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500" />
                
                <button className="modal-close" onClick={onClose}>
                    <X size={20} />
                </button>
                
                <h2 className="modal-header text-2xl">Activate Digital Services</h2>
                <div className="modal-body">
                    <p className="text-gray-400 text-sm mb-4 flex items-center gap-2">
                        <ShieldCheck size={16} className="text-primary" />
                        Secure Activity Protocol
                    </p>

                {/* Asset Selector */}
                <div className="relative mb-6">
                    <label htmlFor="funding-wallet-selector" className="text-xs text-gray-400 font-medium ml-1 mb-1 block">Service Account</label>
                    <button 
                        id="funding-wallet-selector"
                        onClick={() => setShowAssetSelector(!showAssetSelector)}
                        className="w-full flex items-center justify-between bg-gray-800/80 border border-gray-700/50 rounded-xl px-4 py-3 hover:border-purple-500/50 transition-all group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-sm font-bold text-white group-hover:scale-110 transition-transform">
                                {activeCurrency[0]}
                            </div>
                            <div className="text-left">
                                <div className="text-sm font-bold text-white tracking-wide">{activeCurrency}</div>
                                <div className="text-[10px] text-gray-500 uppercase font-medium">{activeNetwork !== 'native' ? activeNetwork : 'Universal Network'}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                             <div className="px-2 py-0.5 rounded-full bg-purple-500/10 border border-purple-500/20 text-[10px] text-purple-400 font-bold uppercase">Change</div>
                             <ChevronDown size={16} className={`text-gray-500 transition-transform duration-300 ${showAssetSelector ? 'rotate-180' : ''}`} />
                        </div>
                    </button>

                    <AnimatePresence>
                        {showAssetSelector && (
                            <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                                className="absolute top-full left-0 right-0 mt-2 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl z-50 overflow-hidden"
                            >
                                <div className="p-2 grid grid-cols-1 gap-1 max-h-60 overflow-y-auto custom-scrollbar">
                                    {wallets.map(w => (
                                        <button
                                            key={`${w.currency}-${w.network}`}
                                            onClick={() => {
                                                setActiveCurrency(w.currency as Currency);
                                                setActiveNetwork(w.network || 'native');
                                                setShowAssetSelector(false);
                                            }}
                                            className={`flex items-center justify-between p-3 rounded-lg transition-all ${activeCurrency === w.currency ? 'bg-purple-600/20 border border-purple-500/30' : 'hover:bg-white/5 border border-transparent'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold">{w.currency[0]}</div>
                                                <div className="text-left">
                                                    <div className="text-sm font-bold">{w.currency}</div>
                                                    <div className="text-[10px] text-gray-500">{w.network || 'Native'}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs font-bold">{(w.available_balance ?? w.balance).toLocaleString()}</div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Summary Card */}
                <div className="bg-gray-800/50 rounded-xl p-4 mb-6 border border-gray-700/50">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-gray-400 text-xs uppercase tracking-wider">Target Action</span>
                        <span className="text-white text-sm font-medium">
                            {isEffectivelyPurchase ? `Access ${effectiveTargetCurrency}` : `Allocate to ${activeCurrency}`}
                        </span>
                    </div>
                    <div className="flex justify-between items-end">
                        <span className="text-gray-400 text-xs uppercase tracking-wider">
                            {isEffectivelyPurchase ? 'Allocation amount' : 'Allocation Amount'}
                        </span>
                        <div className="text-right">
                            <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                                {amount || '0.00'}
                            </span>
                            <span className="ml-2 text-gray-500 font-medium">{effectivePayCurrency}</span>
                        </div>
                    </div>
                </div>

                {/* Purchase Mode Toggle (Only show if starting from Fiat wallet) */}
                {isFiat && (
                    <div className="flex items-center justify-between mb-4 px-1">
                        <span className="text-sm text-gray-400">Access Digital Assets Directly?</span>
                        <button 
                            onClick={() => setIsPurchase(!isPurchase)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${isPurchase ? 'bg-purple-600' : 'bg-gray-700'}`}
                        >
                            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isPurchase ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                )}

                {/* Target Crypto Selector */}
                <AnimatePresence>
                    {isPurchase && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            className="bg-purple-900/10 border border-purple-500/20 rounded-xl p-3 mb-4 space-y-2"
                        >
                            <span className="text-xs text-purple-400 font-medium ml-1 block">Receive Asset</span>
                            <div className="flex flex-wrap gap-2 justify-start sm:justify-between">
                                {['BTC', 'ETH', 'USDT', 'USDC'].map(coin => (
                                    <button
                                        key={coin}
                                        onClick={() => setTargetCurrency(coin)}
                                        className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl min-w-[80px] flex-1 text-xs font-bold border transition-all duration-300 ${
                                            targetCurrency === coin 
                                            ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-500/40 scale-[1.02]' 
                                            : 'bg-gray-900/50 border-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-800 hover:border-gray-700'
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] ${
                                            targetCurrency === coin ? 'bg-white/20' : 'bg-white/5'
                                        }`}>
                                            {coin[0]}
                                        </div>
                                        {coin}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>

                <div className="flex gap-2 mb-6 bg-gray-900/50 p-1 rounded-xl border border-gray-800">
                    <button
                        onClick={() => setMethod('card')}
                        className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg transition-all ${
                            method === 'card' 
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' 
                                : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                    >
                        <CreditCard size={18} />
                        <span className="text-sm font-medium">Card</span>
                    </button>
                    <button
                        onClick={() => setMethod('bank')}
                        className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg transition-all ${
                            method === 'bank' 
                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' 
                                : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                    >
                        <Landmark size={18} />
                        <span className="text-sm font-medium">Transfer</span>
                    </button>
                    {isCrypto && (
                        <button
                            onClick={() => setMethod('crypto')}
                            className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg transition-all ${
                                method === 'crypto' 
                                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' 
                                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                            }`}
                        >
                            <Bitcoin size={18} />
                            <span className="text-sm font-medium">Crypto</span>
                        </button>
                    )}
                </div>

                {/* Fiat Payment Currency Selector (When buying crypto directly from a Crypto wallet view) */}
                <AnimatePresence>
                    {isCrypto && (method === 'card' || method === 'bank') && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 'auto' }}
                            className="bg-purple-900/10 border border-purple-500/20 rounded-xl p-3 mb-6 space-y-2"
                        >
                            <span className="text-xs text-purple-400 font-medium ml-1 block">Pay With Fiat</span>
                            <div className="flex flex-wrap gap-2 justify-start sm:justify-between">
                                {['USD', 'EUR', 'GBP', 'NGN'].map(fiat => (
                                    <button
                                        key={fiat}
                                        onClick={() => setPaymentFiat(fiat)}
                                        className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-xl min-w-[80px] flex-1 text-[10px] font-bold border transition-all duration-300 ${
                                            paymentFiat === fiat 
                                            ? 'bg-purple-600 border-purple-400 text-white shadow-lg shadow-purple-500/40 scale-[1.02]' 
                                            : 'bg-gray-900/50 border-gray-800 text-gray-400 hover:text-gray-200 hover:bg-gray-800 hover:border-gray-700'
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] ${
                                            paymentFiat === fiat ? 'bg-white/20' : 'bg-white/5'
                                        }`}>
                                            {fiat === 'NGN' ? '₦' : (fiat === 'EUR' ? '€' : (fiat === 'GBP' ? '£' : '$'))}
                                        </div>
                                        {fiat}
                                    </button>
                                ))}
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
                
                <AnimatePresence mode="wait">
                    <motion.div
                        key={method}
                        initial={{ opacity: 0, x: 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        transition={{ duration: 0.2 }}
                    >
                        {/* Card Deposit */}
                        {method === 'card' && (
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="card-amount" className="block text-sm text-gray-400 mb-2 cursor-pointer">Amount</label>
                                    <div className="relative">
                                        <input
                                            id="card-amount"
                                            name="amount"
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none pr-16"
                                            autoComplete="off"
                                        />
                                        <span className="absolute right-4 top-3 text-gray-400 font-bold">
                                            {effectivePayCurrency}
                                        </span>
                                    </div>
                                    <div className="flex justify-between mt-2 px-1">
                                        <span className="text-[10px] text-gray-500">Daily Limit: {dailyLimit} {effectivePayCurrency}</span>
                                        <span className="text-[10px] text-gray-500">Transaction Max: {MAX_PER_TRANSACTION} {effectivePayCurrency}</span>
                                    </div>
                                </div>
                                <Button onClick={handleCardDeposit} disabled={loading} className="w-full h-12 text-base font-bold">
                                    {loading ? <Loader2 className="animate-spin mr-2" size={20} /> : <Zap className="mr-2" size={20} />}
                                    Proceed to Checkout
                                </Button>
                            </div>
                        )}

                        {/* Bank Deposit */}
                        {method === 'bank' && !bankDetails && (
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="bank-amount" className="block text-sm text-gray-400 mb-2 cursor-pointer">Amount</label>
                                    <div className="relative">
                                        <input
                                            id="bank-amount"
                                            name="amount"
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="0.00"
                                            className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none pr-16"
                                            autoComplete="off"
                                        />
                                        <span className="absolute right-4 top-3 text-gray-400 font-bold">
                                            {effectivePayCurrency}
                                        </span>
                                    </div>
                                </div>
                                <Button onClick={handleBankDeposit} disabled={loading} className="w-full h-12 text-base font-bold">
                                    {loading ? <Loader2 className="animate-spin mr-2" size={20} /> : <Landmark className="mr-2" size={20} />}
                                    Generate Transfer Details
                                </Button>
                            </div>
                        )}

                        {/* Bank Details Display */}
                        {method === 'bank' && bankDetails && (
                            <div className="space-y-4">
                                <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400">Bank Name</span>
                                        <span className="font-medium">{bankDetails.bankDetails.bankName}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400">Account Number</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-medium">{bankDetails.bankDetails.accountNumber}</span>
                                            <button onClick={() => copyToClipboard(bankDetails.bankDetails.accountNumber)}>
                                                <Copy size={16} className="text-gray-400 hover:text-white" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400">Account Reference</span>
                                        <span className="font-medium">{bankDetails.bankDetails.accountName}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400">Reference</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-xs text-purple-400 break-all">{bankDetails.bankDetails.reference}</span>
                                            <button onClick={() => copyToClipboard(bankDetails.bankDetails.reference)}>
                                                <Copy size={16} className="text-gray-400 hover:text-white" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-sm text-yellow-400 text-center">
                                    Include the reference in your activity description
                                </p>
                                <Button onClick={onClose} variant="secondary" className="w-full">
                                    Done
                                </Button>
                            </div>
                        )}

                        {/* Crypto Deposit */}
                        {method === 'crypto' && (
                            <div className="space-y-4">
                                {!cryptoAddress ? (
                                    <div className="space-y-4">
                                        <div>
                                            <label htmlFor="crypto-amount" className="block text-sm text-gray-400 mb-2 cursor-pointer">Amount to Fund</label>
                                            <div className="relative">
                                                <input
                                                    id="crypto-amount"
                                                    name="amount"
                                                    type="number"
                                                    value={amount}
                                                    onChange={(e) => setAmount(e.target.value)}
                                                    placeholder="0.00"
                                                    className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-purple-500 outline-none pr-16"
                                                    autoComplete="off"
                                                />
                                                <span className="absolute right-4 top-3 text-gray-400 font-bold">
                                                    {selectedCurrency}
                                                </span>
                                            </div>
                                        </div>
                                        <Button onClick={handleCryptoDeposit} disabled={loading} className="w-full">
                                            {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : <Bitcoin className="mr-2" size={18} />}
                                            Generate Deposit Address
                                        </Button>
                                    </div>
                                ) : (
                                    <>
                                        <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                                            <div className="text-center mb-4">
                                                <span className="text-sm text-gray-400">Network</span>
                                                <p className="font-medium">{cryptoAddress.network}</p>
                                            </div>
                                            <div className="text-center">
                                                <span className="text-sm text-gray-400">Deposit Address</span>
                                                <div className="mt-2 space-y-3">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <code className="font-mono text-xs bg-gray-900 px-3 py-2 rounded break-all border border-purple-500/30">
                                                            {cryptoAddress.address}
                                                        </code>
                                                        <button onClick={() => copyToClipboard(cryptoAddress.address)}>
                                                            <Copy size={18} className="text-gray-400 hover:text-white transition-colors" />
                                                        </button>
                                                    </div>
                                                    
                                                    {cryptoAddress.paymentUrl && (
                                                        <a 
                                                            href={cryptoAddress.paymentUrl} 
                                                            target="_blank" 
                                                            rel="noopener noreferrer"
                                                            className="inline-block text-xs text-purple-400 hover:text-purple-300 underline"
                                                        >
                                                            Open Checkout Page
                                                        </a>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            <div className="pt-4 border-t border-gray-700 text-center">
                                                <div className="flex items-center justify-center gap-2 text-sm">
                                                    <Loader2 className={`animate-spin text-purple-500 ${cryptoStatus === 'COMPLETED' ? 'hidden' : ''}`} size={16} />
                                                    <span className={cryptoStatus === 'COMPLETED' ? 'text-green-400 font-bold' : 'text-gray-400'}>
                                                        Status: {cryptoStatus}
                                                    </span>
                                                </div>
                                                {cryptoStatus === 'PENDING' && (
                                                    <p className="text-[10px] text-gray-500 mt-1">Polling for payment confirmation...</p>
                                                )}
                                            </div>
                                        </div>
                                        
                                        <p className="text-xs text-yellow-400/80 text-center italic">
                                            Send exactly {amount} {selectedCurrency} to the address above.
                                        </p>
                                        
                                        <div className="flex flex-col gap-2">
                                            <Button 
                                                onClick={handleRegenerateAddress} 
                                                disabled={loading} 
                                                variant="secondary" 
                                                className="w-full text-xs py-2 h-auto"
                                            >
                                                {loading ? <Loader2 className="animate-spin mr-2" size={14} /> : <Bitcoin className="mr-2" size={14} />}
                                                Request Another Address
                                            </Button>
                                            
                                            <Button onClick={onClose} variant="ghost" className="w-full text-gray-400 hover:text-white">
                                                Cancel & Close
                                            </Button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                <div className="mt-8 pt-6 border-t border-gray-800/50 flex flex-wrap items-center justify-center gap-6 text-[10px] text-gray-500">
                    <div className="flex items-center gap-2">
                        <Lock size={12} className="text-primary" />
                        PCI-DSS COMPLIANT
                    </div>
                    <div className="flex items-center gap-2">
                        <ShieldCheck size={12} className="text-primary" />
                        256-BIT ENCRYPTION
                    </div>
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={12} className="text-primary" />
                        SECURE PROTOCOL
                    </div>
                </div>
            </div>
        </motion.div>
    </div>
    );
};
