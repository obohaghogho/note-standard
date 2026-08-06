import React, { useState, useEffect } from 'react';
import { X, CreditCard, Bitcoin, Copy, Loader2, ShieldCheck, CheckCircle2, Landmark, Zap, Lock, ChevronDown, Upload, FileCheck, Smartphone } from 'lucide-react';
import { Button } from '../common/Button';
import walletApi from '../../api/walletApi';
import toast from 'react-hot-toast';
import type { Currency, BankDepositResponse, CryptoDepositResponse } from '@/types/wallet';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../hooks/useWallet';
import { useWalletCapabilities } from '../../hooks/useWalletCapabilities';
import { supabase } from '@/lib/supabase';

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
    const [bankDetails, setBankDetails] = useState<BankDepositResponse | null>(null);
    const [transferRail, setTransferRail] = useState<'ACH' | 'WIRE'>('ACH');
    const [proofFile, setProofFile] = useState<File | null>(null);
    const [uploadingProof, setUploadingProof] = useState(false);
    const [proofSubmitted, setProofSubmitted] = useState(false);

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
    const [isRequestingLimit, setIsRequestingLimit] = useState(false);
    const [requestedLimit, setRequestedLimit] = useState('');
    const [requestReason, setRequestReason] = useState('');
    
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
    const dailyLimit = subscription?.daily_deposit_limit || DAILY_LIMITS[userPlan] || DAILY_LIMITS.FREE;

    const isCrypto = activeCurrency === 'BTC' || activeCurrency === 'ETH' || activeCurrency.startsWith('USDT') || activeCurrency.startsWith('USDC');
    const isFiat = !isCrypto; 

    // For Crypto wallets acting as target, what fiat are they paying with?
    const [paymentFiat, setPaymentFiat] = useState<string>('USD');

    // Auto-detect if this is a cross-currency purchase flow
    const isEffectivelyPurchase = isPurchase || (isCrypto && (method === 'card' || method === 'bank'));
    const effectiveTargetCurrency = isEffectivelyPurchase ? (isCrypto ? activeCurrency : targetCurrency) : undefined;
    const effectiveTargetNetwork = isEffectivelyPurchase ? (isCrypto ? activeNetwork : targetNetwork) : undefined;
    const effectivePayCurrency = isCrypto && (method === 'card' || method === 'bank') ? paymentFiat : activeCurrency;

    const { getCurrencyCapability } = useWalletCapabilities();
    const currencyCap = getCurrencyCapability(effectivePayCurrency);
    const activeDepositRails = currencyCap?.depositMethods || [];

    const [selectedRailId, setSelectedRailId] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            setBankDetails(null);
            setCryptoAddress(null);
            setCryptoStatus('PENDING');
            setAmount('');
            setIsPurchase(false);
            setIsRequestingLimit(false);
            setActiveCurrency(selectedCurrency);
            setActiveNetwork(selectedNetwork);
            setSelectedRailId(null);
        }
    }, [isOpen, selectedCurrency, selectedNetwork]);

    // Sync selectedRailId & method with activeDepositRails
    useEffect(() => {
        if (isOpen) {
            const upCurr = String(activeCurrency || selectedCurrency).toUpperCase();
            const isCryptoWallet = ['BTC', 'ETH', 'USDT', 'USDC'].includes(upCurr);

            if (isCryptoWallet) {
                setMethod('crypto');
                if (activeDepositRails.length > 0) {
                    const cryptoRail = activeDepositRails.find(r => r.type === 'crypto' || r.type === 'fx_settlement') || activeDepositRails[0];
                    if (cryptoRail) setSelectedRailId(cryptoRail.id);
                }
            } else if (activeDepositRails.length > 0) {
                const existingRail = selectedRailId ? activeDepositRails.find(r => r.id === selectedRailId) : null;
                const cardRail = activeDepositRails.find(r => r.type === 'card');
                const targetRail = existingRail || cardRail || activeDepositRails[0];

                if (targetRail) {
                    setSelectedRailId(targetRail.id);
                    if (targetRail.type === 'card') setMethod('card');
                    else if (targetRail.type === 'crypto' || targetRail.type === 'fx_settlement') setMethod('crypto');
                    else setMethod('bank');
                }
            }
        }
    }, [isOpen, activeCurrency, activeDepositRails]);

    // Polling for crypto status
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
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
            const result = (await walletApi.initializePayment({
                amount: parseFloat(amount),
                currency: activeCurrency,
                provider: activeNetwork || 'native'
            })) as CryptoDepositResponse;
            
            setCryptoAddress({
                address: result.payAddress || '',
                reference: result.reference,
                paymentUrl: result.paymentUrl,
                network: activeNetwork !== 'native' ? activeNetwork : (activeCurrency === 'BTC' ? 'Bitcoin' : 'Ethereum')
            });
            toast.success('Deposit address generated!');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to generate crypto address');
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
                network: selectedCurrency.includes('_') ? selectedCurrency.split('_')[1] : (selectedCurrency === 'BTC' ? 'Bitcoin' : 'Ethereum (ERC20)')
            });
            setCryptoStatus('PENDING'); // Reset status for new address
            toast.success("New deposit address generated!");
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to generate new address");
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
            
            // Handle both legacy and new API response structures
            const checkoutLink = result?.data?.link || result?.link || result?.checkoutUrl;
            
            if (checkoutLink) {
                // Redirect to Fincra Checkout
                toast.loading('Redirecting to secure gateway...', { duration: 2000 });
                window.location.href = checkoutLink;
            } else {
                toast.error('Payment initialization failed - no checkout URL received');
                setLoading(false);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Card deposit failed';
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
            toast.success('Deposit allocation details generated!');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to generate bank details');
        } finally {
            setLoading(false);
        }
    };

    const handleRequestLimitIncrease = async () => {
        if (!requestedLimit || parseFloat(requestedLimit) <= dailyLimit) {
            toast.error('Requested limit must be greater than current limit');
            return;
        }
        setLoading(true);
        try {
            await walletApi.createLimitRequest({
                requested_limit: Number(requestedLimit),
                reason: requestReason || 'Business needs'
            });
            toast.success('Limit increase request submitted!');
            setIsRequestingLimit(false);
            setRequestedLimit('');
            setRequestReason('');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to submit request');
        } finally {
            setLoading(false);
        }
    };

    const readFileAsDataUrl = (file: File): Promise<string> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    };

    const handleProofUpload = async () => {
        if (!proofFile || !bankDetails) return;

        setUploadingProof(true);
        try {
            let publicUrl = '';

            try {
                const fileExt = proofFile.name.split('.').pop();
                const fileName = `${bankDetails.bankDetails.reference}_${Math.random().toString(36).substring(7)}.${fileExt}`;
                const filePath = `deposit-proofs/${fileName}`;

                const { error: uploadError } = await supabase.storage
                    .from('receipts')
                    .upload(filePath, proofFile);

                if (!uploadError) {
                    const { data } = supabase.storage
                        .from('receipts')
                        .getPublicUrl(filePath);
                    publicUrl = data.publicUrl;
                } else {
                    console.warn("[FundModal] Supabase storage upload failed, falling back to base64 Data URL:", uploadError.message);
                    publicUrl = await readFileAsDataUrl(proofFile);
                }
            } catch (storageErr) {
                console.warn("[FundModal] Storage error, falling back to base64 Data URL:", storageErr);
                publicUrl = await readFileAsDataUrl(proofFile);
            }

            const res = await walletApi.submitDepositProof({
                reference: bankDetails.bankDetails.reference,
                proof_url: publicUrl,
                amount: parseFloat(amount) || 0,
                currency: selectedCurrency || 'NGN'
            });

            setProofSubmitted(true);
            toast.success(res.message || "Proof of payment submitted successfully!");
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : "Failed to upload proof");
        } finally {
            setUploadingProof(false);
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
                
                <h2 className="modal-header text-2xl">Deposit Funds</h2>
                <div className="modal-body">
                    <p className="text-gray-400 text-sm mb-4 flex items-center gap-2">
                        <ShieldCheck size={16} className="text-primary" />
                        Secure Network Protocol
                    </p>

                {/* Asset Selector */}
                <div className="relative mb-6">
                    <label htmlFor="funding-wallet-selector" className="text-xs text-gray-400 font-medium ml-1 mb-1 block">Funding Wallet</label>
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
                                            key={`${w.asset}-${w.network}`}
                                            onClick={() => {
                                                setActiveCurrency(w.asset as Currency);
                                                setActiveNetwork(w.network || 'native');
                                                setShowAssetSelector(false);
                                            }}
                                            className={`flex items-center justify-between p-3 rounded-lg transition-all ${activeCurrency === w.asset ? 'bg-purple-600/20 border border-purple-500/30' : 'hover:bg-white/5 border border-transparent'}`}
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-xs font-bold">{w.asset?.[0] || '?'}</div>
                                                <div className="text-left">
                                                    <div className="text-sm font-bold">{w.asset}</div>
                                                    <div className="text-[10px] text-gray-500">{w.network || 'Native'}</div>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="text-xs font-bold">{(w.available ?? w.balance).toLocaleString()}</div>
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
                            {isEffectivelyPurchase ? `Buy ${effectiveTargetCurrency}` : `Allocate to ${activeCurrency}`}
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
                        <span className="text-sm text-gray-400">Buy Digital Assets Directly?</span>
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
                                            ? 'bg-purple-600 border-red-500 ring-2 ring-red-500 text-white shadow-lg shadow-red-500/40 scale-[1.02]' 
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

                {/* Dynamically Rendered Active Payment Rails */}
                <div className="flex gap-2 mb-6 bg-gray-900/50 p-1.5 rounded-xl border border-gray-800 flex-wrap">
                    {activeDepositRails.map((rail) => {
                        let railMethodKey: DepositMethod = 'bank';
                        if (rail.type === 'card') railMethodKey = 'card';
                        else if (rail.type === 'crypto' || rail.type === 'fx_settlement') railMethodKey = 'crypto';

                        const isSelected = selectedRailId === rail.id;

                        let IconComponent = Landmark;
                        if (rail.type === 'card') IconComponent = CreditCard;
                        else if (rail.type === 'mobile_money') IconComponent = Smartphone;
                        else if (rail.type === 'faster_payments') IconComponent = Zap;
                        else if (rail.type === 'crypto' || rail.type === 'fx_settlement') IconComponent = Bitcoin;

                        return (
                            <button
                                key={rail.id}
                                type="button"
                                onClick={() => {
                                    setSelectedRailId(rail.id);
                                    setMethod(railMethodKey);
                                }}
                                className={`flex-1 min-w-[130px] flex flex-col items-center justify-center p-2.5 rounded-lg transition-all ${
                                    isSelected 
                                        ? 'bg-purple-600 border border-purple-400 ring-2 ring-purple-500 text-white shadow-lg' 
                                        : 'border border-transparent text-gray-400 hover:text-white hover:bg-gray-800'
                                }`}
                            >
                                <div className="flex items-center gap-1.5 font-bold text-xs">
                                    <IconComponent size={16} />
                                    <span>{rail.name}</span>
                                </div>
                                <div className="flex items-center gap-1 text-[10px] text-purple-200 mt-0.5 opacity-90">
                                    <span>{rail.fee.text}</span>
                                    <span>•</span>
                                    <span>{rail.estimatedSettlement}</span>
                                </div>
                            </button>
                        );
                    })}
                </div>

                {/* Selected Payment Rail Metadata Card */}
                {(() => {
                    const selectedRail = activeDepositRails.find(r => r.id === selectedRailId) || 
                        activeDepositRails.find(r => r.type === 'card') || 
                        activeDepositRails[0];

                    if (!selectedRail) return null;

                    return (
                        <div className="bg-purple-950/30 border border-purple-500/30 rounded-xl p-3.5 mb-4 text-xs space-y-1.5 text-purple-200">
                            <div className="flex items-center justify-between font-semibold border-b border-purple-500/20 pb-1.5">
                                <span className="text-white flex items-center gap-1.5">
                                    <Zap className="w-3.5 h-3.5 text-purple-400" />
                                    {selectedRail.name} Rail Specification
                                </span>
                                <span className="text-[10px] text-purple-300 bg-purple-500/20 px-2 py-0.5 rounded font-mono uppercase">
                                    Provider: {selectedRail.provider}
                                </span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px]">
                                <div>Est. Settlement: <strong className="text-white">{selectedRail.estimatedSettlement}</strong></div>
                                <div>Fee: <strong className="text-white">{selectedRail.fee.text}</strong></div>
                                <div>Min Amount: <strong className="text-white">{selectedRail.limits.minimum.toLocaleString()} {effectivePayCurrency}</strong></div>
                                <div>Max Amount: <strong className="text-white">{selectedRail.limits.maximum.toLocaleString()} {effectivePayCurrency}</strong></div>
                            </div>
                        </div>
                    );
                })()}

                {/* Informational Operational Notice Box (Non-Error UX) */}
                {!activeDepositRails.some(r => r.type === 'card') && !isCrypto && (
                    <div className="p-3 bg-cyan-950/20 border border-cyan-500/20 rounded-xl text-[11px] text-cyan-300 flex items-start gap-2.5 mb-4 leading-relaxed">
                        <span className="text-sm select-none">ℹ️</span>
                        <div>
                            <strong className="font-semibold text-cyan-200 block mb-0.5">Active Deposit Rails ({effectivePayCurrency}):</strong>
                            <span className="text-gray-400">Direct collection is active via banking provider. Supported deposit methods:</span>
                            <ul className="list-disc list-inside mt-1 font-medium space-y-0.5 text-cyan-300">
                                {activeDepositRails.map(r => (
                                    <li key={r.id}>{r.name} ({r.estimatedSettlement})</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

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
                                            ? 'bg-purple-600 border-red-500 ring-2 ring-red-500 text-white shadow-lg shadow-red-500/40 scale-[1.02]' 
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
                                    <div className="flex justify-between items-center mt-2 px-1">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-gray-500">Daily Limit: {dailyLimit.toLocaleString()} {effectivePayCurrency}</span>
                                            <span className="text-[10px] text-gray-500">Transaction Max: {MAX_PER_TRANSACTION.toLocaleString()} {effectivePayCurrency}</span>
                                        </div>
                                        <button 
                                            onClick={() => setIsRequestingLimit(true)}
                                            className="text-[10px] text-primary hover:text-primary-dark font-bold underline"
                                        >
                                            Request Increase
                                        </button>
                                    </div>
                                </div>
                                <div className="p-3 bg-purple-950/20 border border-purple-500/30 rounded-xl text-[11px] text-purple-300 flex items-start gap-2.5 mb-4 leading-relaxed">
                                    <span className="text-sm select-none">ℹ️</span>
                                    <span>
                                        <strong>Secure Card Payment:</strong> You will be redirected to a secure payment gateway for <strong>Credit & Debit Card</strong> deposits. NoteStandard does not store your card details.
                                    </span>
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
                                    <div className="flex justify-between items-center mt-2 px-1">
                                        <span className="text-[10px] text-gray-500">Daily Limit: {dailyLimit.toLocaleString()} {effectivePayCurrency}</span>
                                        <button 
                                            onClick={() => setIsRequestingLimit(true)}
                                            className="text-[10px] text-primary hover:text-primary-dark font-bold underline"
                                        >
                                            Request Increase
                                        </button>
                                    </div>
                                </div>
                                {effectivePayCurrency === 'NGN' && (
                                    <div className="p-3 bg-purple-950/20 border border-purple-500/30 rounded-xl text-[11px] text-purple-300 flex items-start gap-2.5 mb-4 leading-relaxed">
                                        <span className="text-sm select-none">ℹ️</span>
                                        <span>
                                            <strong>Dedicated Account Transfer:</strong> Generate a unique NGN bank account assigned specifically to your wallet. Any bank app transfer made to this account will credit your balance instantly.
                                        </span>
                                    </div>
                                )}
                                <Button onClick={handleBankDeposit} disabled={loading} className="w-full h-12 text-base font-bold">
                                    {loading ? <Loader2 className="animate-spin mr-2" size={20} /> : <Landmark className="mr-2" size={20} />}
                                    Generate Transfer Details
                                </Button>
                            </div>
                        )}

                        {/* Bank Details Display */}
                        {method === 'bank' && bankDetails && (
                            <div className="space-y-5">
                                {/* Provider Badge Header */}
                                <div className="flex items-center justify-between p-3 bg-gray-800/80 border border-gray-700/60 rounded-xl text-xs">
                                    <div className="flex items-center gap-2">
                                        <span className="text-gray-400 font-semibold">Provider:</span>
                                        <span className="bg-purple-600/20 text-purple-300 px-2.5 py-1 rounded-md font-bold flex items-center gap-1.5 border border-purple-500/30">
                                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                                            {effectivePayCurrency === 'NGN' ? 'FINCRA | Guaranty Trust Bank' : 'GREY | Lead Bank (USA)'}
                                        </span>
                                    </div>
                                    <span className="text-emerald-400 font-bold text-[11px]">✓ Live Virtual Account</span>
                                </div>

                                {effectivePayCurrency === 'USD' && (
                                    <>
                                        {/* Transfer Type Selector */}
                                        <div className="grid grid-cols-2 gap-2 p-1 bg-gray-900 border border-gray-800 rounded-xl">
                                            <button
                                                type="button"
                                                onClick={() => setTransferRail('ACH')}
                                                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex flex-col items-center gap-0.5 ${
                                                    transferRail === 'ACH'
                                                        ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                                                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                                }`}
                                            >
                                                <span>ACH Transfer</span>
                                                <span className="text-[10px] opacity-80 font-normal">1-2 Business Days</span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setTransferRail('WIRE')}
                                                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex flex-col items-center gap-0.5 ${
                                                    transferRail === 'WIRE'
                                                        ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                                                        : 'text-gray-400 hover:text-white hover:bg-gray-800'
                                                }`}
                                            >
                                                <span>Wire Transfer</span>
                                                <span className="text-[10px] opacity-80 font-normal">Same Day</span>
                                            </button>
                                        </div>

                                        {/* Transfer Rail Meta Summary Banner */}
                                        <div className="grid grid-cols-3 gap-2 text-center text-xs p-3 bg-gray-900/60 border border-gray-800 rounded-xl">
                                            <div>
                                                <p className="text-[10px] text-gray-500 font-medium">Est. Settlement</p>
                                                <p className="font-bold text-white mt-0.5">{transferRail === 'ACH' ? '1-2 Business Days' : 'Same Day'}</p>
                                            </div>
                                            <div className="border-x border-gray-800 px-1">
                                                <p className="text-[10px] text-gray-500 font-medium">Fee</p>
                                                <p className="font-bold text-purple-300 mt-0.5">{transferRail === 'ACH' ? '$2.00 Flat' : '$15.00 Flat'}</p>
                                            </div>
                                            <div>
                                                <p className="text-[10px] text-gray-500 font-medium">Limits</p>
                                                <p className="font-bold text-white mt-0.5">{transferRail === 'ACH' ? '$10 - $50k' : '$100 - $500k'}</p>
                                            </div>
                                        </div>
                                    </>
                                )}

                                {/* Safe & Secure Banner */}
                                <div className="flex items-center gap-2.5 p-3 bg-emerald-950/20 border border-emerald-500/30 rounded-xl text-xs text-emerald-300">
                                    <ShieldCheck size={18} className="text-emerald-400 shrink-0" />
                                    <span><strong>Safe & Secure Transfer:</strong> Your payment is protected with bank-level security and encrypted processing.</span>
                                </div>

                                {/* Bank Account Details Section */}
                                <div className="bg-gray-800/90 rounded-xl p-4 space-y-3.5 border border-gray-700/60">
                                    <div className="flex justify-between items-center pb-2 border-b border-gray-700/60">
                                        <div>
                                            <h4 className="text-xs font-bold text-white uppercase tracking-wider">Bank Account Details</h4>
                                            <p className="text-[10px] text-gray-400">
                                                {effectivePayCurrency === 'NGN' 
                                                    ? 'Transfer NGN to the GTBank Virtual Account below' 
                                                    : `Send your ${transferRail} transfer to the account below`}
                                            </p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const bName = bankDetails?.bankDetails?.bankName || (bankDetails as any)?.instructions?.account?.bank_name || (effectivePayCurrency === 'NGN' ? 'Guaranty Trust Bank' : 'Lead Bank');
                                                const aHolder = bankDetails?.bankDetails?.accountName || (bankDetails as any)?.instructions?.account?.holder || 'JOSSY DIGITAL TECHNOLOGIES LTD';
                                                const aNum = bankDetails?.bankDetails?.accountNumber || (bankDetails as any)?.instructions?.account?.number || (effectivePayCurrency === 'NGN' ? '5000701121' : '217394889898');
                                                const bCode = bankDetails?.bankDetails?.bankCode || (bankDetails as any)?.instructions?.account?.bank_code || (effectivePayCurrency === 'NGN' ? '058' : '');
                                                const refCode = bankDetails?.bankDetails?.reference || (bankDetails as any)?.instructions?.reference?.code || bankDetails?.providerReference || 'NS-NGN-TRANSFER';
                                                
                                                const formatted = effectivePayCurrency === 'NGN'
                                                    ? `Bank Name: ${bName}\nBank Code: ${bCode}\nAccount Holder: ${aHolder}\nAccount Number: ${aNum}\nReference: ${refCode}`
                                                    : `Bank Name: ${bName}\nAccount Holder: ${aHolder}\nAccount Number: ${aNum}\nACH Routing: ${bankDetails?.bankDetails?.achRouting || '101019644'}\nReference: ${refCode}`;
                                                copyToClipboard(formatted);
                                                toast.success('All bank details copied to clipboard!');
                                            }}
                                            className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-md text-[11px] font-bold transition-colors flex items-center gap-1"
                                        >
                                            <Copy size={13} />
                                            Copy All
                                        </button>
                                    </div>

                                    {/* Bank Name */}
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-400">Bank Name</span>
                                        <span className="font-bold text-white">
                                            {bankDetails?.bankDetails?.bankName || (bankDetails as any)?.instructions?.account?.bank_name || (effectivePayCurrency === 'NGN' ? 'Guaranty Trust Bank' : 'Lead Bank')}
                                        </span>
                                    </div>

                                    {/* Bank Code (For NGN) */}
                                    {effectivePayCurrency === 'NGN' && (
                                        <div className="flex justify-between items-center text-xs">
                                            <span className="text-gray-400">Bank Code</span>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono font-bold text-white">
                                                    {bankDetails?.bankDetails?.bankCode || (bankDetails as any)?.instructions?.account?.bank_code || '058'}
                                                </span>
                                                <button onClick={() => copyToClipboard(bankDetails?.bankDetails?.bankCode || (bankDetails as any)?.instructions?.account?.bank_code || '058')}>
                                                    <Copy size={14} className="text-gray-400 hover:text-white" />
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {/* Account Holder */}
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-400">Account Holder</span>
                                        <span className="font-bold text-white">
                                            {bankDetails?.bankDetails?.accountName || (bankDetails as any)?.instructions?.account?.holder || 'JOSSY DIGITAL TECHNOLOGIES LTD'}
                                        </span>
                                    </div>

                                    {/* Account Type */}
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-400">Account Type</span>
                                        <span className="font-bold text-white">
                                            {bankDetails?.bankDetails?.accountType || (bankDetails as any)?.instructions?.account?.type || (effectivePayCurrency === 'NGN' ? 'Virtual Account' : 'Checking')}
                                        </span>
                                    </div>

                                    {/* Account Number */}
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-gray-400">Account Number</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold text-white text-sm">
                                                {bankDetails?.bankDetails?.accountNumber || (bankDetails as any)?.instructions?.account?.number || (effectivePayCurrency === 'NGN' ? '5000701121' : '217394889898')}
                                            </span>
                                            <button onClick={() => copyToClipboard(bankDetails?.bankDetails?.accountNumber || (bankDetails as any)?.instructions?.account?.number || (effectivePayCurrency === 'NGN' ? '5000701121' : '217394889898'))}>
                                                <Copy size={14} className="text-gray-400 hover:text-white" />
                                            </button>
                                        </div>
                                    </div>

                                    {/* USD Routing & Address Fields */}
                                    {effectivePayCurrency === 'USD' && (
                                        <>
                                            {/* ACH Routing Number */}
                                            <div className="flex justify-between items-center text-xs">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-gray-400">ACH Routing Number</span>
                                                    <span className="text-[9px] bg-purple-600/30 text-purple-300 font-bold px-1.5 py-0.5 rounded">ACH</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-white">{bankDetails?.bankDetails?.achRouting || (bankDetails as any)?.instructions?.account?.ach_routing || '101019644'}</span>
                                                    <button onClick={() => copyToClipboard(bankDetails?.bankDetails?.achRouting || (bankDetails as any)?.instructions?.account?.ach_routing || '101019644')}>
                                                        <Copy size={14} className="text-gray-400 hover:text-white" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Wire Routing Number */}
                                            <div className="flex justify-between items-center text-xs">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-gray-400">Wire Routing Number</span>
                                                    <span className="text-[9px] bg-blue-600/30 text-blue-300 font-bold px-1.5 py-0.5 rounded">WIRE</span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono font-bold text-white">{bankDetails?.bankDetails?.wireRouting || (bankDetails as any)?.instructions?.account?.wire_routing || '101019644'}</span>
                                                    <button onClick={() => copyToClipboard(bankDetails?.bankDetails?.wireRouting || (bankDetails as any)?.instructions?.account?.wire_routing || '101019644')}>
                                                        <Copy size={14} className="text-gray-400 hover:text-white" />
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Bank Address */}
                                            <div className="flex justify-between items-start text-xs pt-1 border-t border-gray-700/40">
                                                <span className="text-gray-400 shrink-0 mr-2">Bank Address (For Wires)</span>
                                                <div className="flex items-start gap-2 text-right">
                                                    <span className="font-medium text-gray-300 text-[11px] leading-tight break-all max-w-[200px]">{bankDetails?.bankDetails?.bankAddress || (bankDetails as any)?.instructions?.account?.address || '1801 Main St., Kansas City, MO 64108, United States'}</span>
                                                    <button onClick={() => copyToClipboard(bankDetails?.bankDetails?.bankAddress || (bankDetails as any)?.instructions?.account?.address || '1801 Main St., Kansas City, MO 64108, United States')}>
                                                        <Copy size={14} className="text-gray-400 hover:text-white shrink-0 mt-0.5" />
                                                    </button>
                                                </div>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Persistent Unique Reference Box */}
                                <div className="p-4 bg-purple-950/40 border border-purple-500/50 rounded-xl space-y-2 relative overflow-hidden">
                                    <div className="flex justify-between items-center">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-purple-400 animate-pulse"></span>
                                            <span className="text-xs font-bold text-purple-200 uppercase tracking-wide">Your Permanent Reference</span>
                                        </div>
                                        <span className="text-[10px] bg-purple-500/30 text-purple-300 px-2 py-0.5 rounded-md font-bold">Reusable Forever</span>
                                    </div>

                                    <div className="flex items-center justify-between bg-purple-900/60 p-3 rounded-lg border border-purple-400/30">
                                        <span className="font-mono text-base font-extrabold text-purple-200 tracking-wider">
                                            {bankDetails?.bankDetails?.reference || (bankDetails as any)?.instructions?.reference?.code || bankDetails?.providerReference || (effectivePayCurrency === 'NGN' ? 'NS-NGN-REGISTERING' : 'NS-9X2AB71')}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => copyToClipboard(bankDetails?.bankDetails?.reference || (bankDetails as any)?.instructions?.reference?.code || bankDetails?.providerReference || (effectivePayCurrency === 'NGN' ? 'NS-NGN-REGISTERING' : 'NS-9X2AB71'))}
                                            className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-md text-xs font-bold transition-colors flex items-center gap-1.5 shadow"
                                        >
                                            <Copy size={14} />
                                            Copy Code
                                        </button>
                                    </div>
                                    <p className="text-[11px] text-purple-300/80 leading-snug">
                                        Include this reference in your bank transfer memo/notes. This code is permanently assigned to your NoteStandard account for instant automated matching.
                                    </p>
                                </div>

                                {/* Live Deposit Status Pipeline */}
                                <div className="p-3.5 bg-gray-900/80 border border-gray-800 rounded-xl space-y-2.5">
                                    <div className="flex justify-between items-center">
                                        <span className="text-xs font-bold text-gray-300">Live Deposit Status</span>
                                        <span className="text-[10px] bg-amber-500/20 text-amber-300 font-bold px-2 py-0.5 rounded-md flex items-center gap-1">
                                            <Loader2 size={10} className="animate-spin" />
                                            Waiting for transfer
                                        </span>
                                    </div>
                                    <div className="grid grid-cols-5 gap-1 pt-1 text-[9px] font-bold text-center">
                                        <div className="p-1.5 rounded bg-purple-600 text-white">1. Waiting</div>
                                        <div className="p-1.5 rounded bg-gray-800 text-gray-500">2. Detected</div>
                                        <div className="p-1.5 rounded bg-gray-800 text-gray-500">3. Matching</div>
                                        <div className="p-1.5 rounded bg-gray-800 text-gray-500">4. Crediting</div>
                                        <div className="p-1.5 rounded bg-gray-800 text-gray-500">5. Done</div>
                                    </div>
                                </div>

                                {/* Incoming Fee Notice */}
                                <div className="p-3 bg-blue-950/20 border border-blue-500/30 rounded-xl text-[11px] text-blue-300 leading-relaxed space-y-1">
                                    <p className="font-bold flex items-center gap-1.5 text-blue-200">
                                        <span>ℹ️</span> Incoming Provider Fee Notice
                                    </p>
                                    <p className="text-[10.5px] text-blue-300/90">
                                        {effectivePayCurrency === 'NGN' 
                                            ? "Fincra processes incoming Nigerian Naira (NGN) bank transfers with zero hidden deposit surcharges. Transfers settle directly into your NoteStandard wallet."
                                            : "Grey charges a flat fee for incoming bank transfers (ACH: $2.00, Wire: $15.00). These provider fees are recorded separately in NoteStandard's treasury and do not affect your wallet credit."}
                                    </p>
                                </div>

                                {/* Deposit Boundaries Matrix */}
                                <div className="grid grid-cols-2 gap-2 text-[11px] p-3 bg-gray-900/60 border border-gray-800 rounded-xl">
                                    {effectivePayCurrency === 'NGN' ? (
                                        <>
                                            <div className="space-y-1">
                                                <p className="font-bold text-emerald-400 text-[11px]">Supported</p>
                                                <p className="text-gray-300">✓ NGN Bank Transfers</p>
                                                <p className="text-gray-300">✓ Nigerian Commercial Banks</p>
                                                <p className="text-gray-300">✓ GTBank Virtual Accounts</p>
                                                <p className="text-gray-300">✓ NIBSS Instant Payments (NIP)</p>
                                            </div>
                                            <div className="space-y-1 border-l border-gray-800 pl-3">
                                                <p className="font-bold text-red-400 text-[11px]">Not Supported</p>
                                                <p className="text-gray-400">✗ Foreign USD/EUR Banks</p>
                                                <p className="text-gray-400">✗ International Wire/ACH</p>
                                                <p className="text-gray-400">✗ Non-NGN Currency</p>
                                            </div>
                                        </>
                                    ) : (
                                        <>
                                            <div className="space-y-1">
                                                <p className="font-bold text-emerald-400 text-[11px]">Supported</p>
                                                <p className="text-gray-300">✓ ACH Transfers</p>
                                                <p className="text-gray-300">✓ Domestic US Wires</p>
                                                <p className="text-gray-300">✓ USD Currency</p>
                                                <p className="text-gray-300">✓ US Domestic Banks</p>
                                            </div>
                                            <div className="space-y-1 border-l border-gray-800 pl-3">
                                                <p className="font-bold text-red-400 text-[11px]">Not Supported</p>
                                                <p className="text-gray-400">✗ SWIFT Transfers</p>
                                                <p className="text-gray-400">✗ International Wires</p>
                                                <p className="text-gray-400">✗ Non-USD Deposits</p>
                                            </div>
                                        </>
                                    )}
                                </div>

                                {/* Direct Deposit Slip Proof Upload */}
                                <div className="p-4 bg-gray-900 border border-gray-800 rounded-xl space-y-3">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-purple-600 rounded-lg">
                                            <Upload size={18} className="text-white" />
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold text-white">Upload Bank Deposit Slip</h4>
                                            <p className="text-[10px] text-gray-400">Optional: Upload receipt for faster manual verification</p>
                                        </div>
                                    </div>

                                    {!proofSubmitted ? (
                                        <div className="space-y-3">
                                            <input 
                                                type="file" 
                                                id="proof-upload" 
                                                name="proof_upload"
                                                className="hidden" 
                                                accept="image/*,.pdf"
                                                onChange={(e) => setProofFile(e.target.files?.[0] || null)}
                                            />
                                            <label 
                                                htmlFor="proof-upload" 
                                                className="flex items-center justify-center gap-2 w-full p-2.5 bg-gray-800 border border-dashed border-gray-700 rounded-lg cursor-pointer hover:border-purple-500 transition-colors"
                                            >
                                                {proofFile ? (
                                                    <span className="text-xs text-purple-400 font-medium truncate max-w-[200px]">{proofFile.name}</span>
                                                ) : (
                                                    <>
                                                        <Upload size={14} className="text-gray-400" />
                                                        <span className="text-xs text-gray-400">Choose receipt image/PDF</span>
                                                    </>
                                                )}
                                            </label>

                                            {proofFile && (
                                                <Button 
                                                    onClick={handleProofUpload} 
                                                    disabled={uploadingProof} 
                                                    className="w-full h-9 text-xs bg-purple-600 hover:bg-purple-700"
                                                >
                                                    {uploadingProof ? <Loader2 size={14} className="animate-spin mr-2" /> : <FileCheck size={14} className="mr-2" />}
                                                    Submit Proof for Verification
                                                </Button>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center gap-2 p-2.5 bg-emerald-500/20 border border-emerald-500/30 rounded-lg">
                                            <CheckCircle2 size={16} className="text-emerald-500" />
                                            <span className="text-xs text-emerald-400 font-bold">Proof Submitted Successfully</span>
                                        </div>
                                    )}
                                </div>

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

                {/* Limit Request Overlay */}
                <AnimatePresence>
                    {isRequestingLimit && (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 20 }}
                            className="absolute inset-0 bg-gray-900/95 z-[60] p-6 flex flex-col justify-center"
                        >
                            <div className="text-center mb-6">
                                <Zap className="mx-auto text-primary mb-2" size={32} />
                                <h3 className="text-xl font-bold">Request Limit Increase</h3>
                                <p className="text-gray-400 text-xs mt-1">Submit a request to increase your daily ${dailyLimit.toLocaleString()} limit.</p>
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="requested-limit" className="block text-[10px] uppercase text-gray-500 mb-1 ml-1">Requested Daily Limit (USD)</label>
                                    <input 
                                        id="requested-limit"
                                        name="requested_limit"
                                        type="number"
                                        value={requestedLimit}
                                        onChange={e => setRequestedLimit(e.target.value)}
                                        placeholder="e.g. 5000"
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-primary outline-none"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="limit-reason" className="block text-[10px] uppercase text-gray-500 mb-1 ml-1">Reason (Optional)</label>
                                    <textarea 
                                        id="limit-reason"
                                        name="reason"
                                        value={requestReason}
                                        onChange={e => setRequestReason(e.target.value)}
                                        placeholder="Why do you need an increase?"
                                        className="w-full bg-gray-800 border border-gray-700 rounded-lg p-3 text-white focus:border-primary outline-none h-20 resize-none"
                                    />
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <Button 
                                        onClick={() => setIsRequestingLimit(false)}
                                        variant="secondary"
                                        className="flex-1"
                                    >
                                        Cancel
                                    </Button>
                                    <Button 
                                        onClick={handleRequestLimitIncrease}
                                        disabled={loading || !requestedLimit}
                                        className="flex-1"
                                    >
                                        {loading ? <Loader2 className="animate-spin" size={20} /> : 'Submit Request'}
                                    </Button>
                                </div>
                                <p className="text-[10px] text-gray-500 text-center mt-4 italic">Requests are usually processed within 24 hours.</p>
                            </div>
                        </motion.div>
                    )}
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
