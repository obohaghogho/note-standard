import React, { useState, useEffect } from 'react';
import { X, CreditCard, Building2, Bitcoin, Copy, ArrowRight, Loader2, ShieldCheck, CheckCircle2 } from 'lucide-react';
import { Button } from '../common/Button';
import { walletApi } from '../../lib/walletApi';
import toast from 'react-hot-toast';
import type { Currency } from '@/types/wallet';
import { motion, AnimatePresence } from 'framer-motion';

interface FundModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedCurrency: Currency;
    onSuccess: () => void;
}

type DepositMethod = 'card' | 'bank' | 'crypto';

export const FundModal: React.FC<FundModalProps> = ({ isOpen, onClose, selectedCurrency, onSuccess: _onSuccess }) => {
    const [method, setMethod] = useState<DepositMethod>('card');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    
    // Bank deposit state
    const [bankDetails, setBankDetails] = useState<{
        reference: string;
        bankDetails: { bankName: string; accountNumber: string; accountName: string; reference: string };
        expiresAt: string;
    } | null>(null);
    
    // Crypto deposit state
    const [cryptoAddress, setCryptoAddress] = useState<{
        address: string;
        network?: string;
        minDeposit?: number;
        reference?: string;
        paymentUrl?: string;
    } | null>(null);
    const [cryptoStatus, setCryptoStatus] = useState<string>('PENDING');

    const isCrypto = selectedCurrency === 'BTC' || selectedCurrency === 'ETH';
    const isFiat = !isCrypto; 

    useEffect(() => {
        // Reset state when modal opens
        if (isOpen) {
            setAmount('');
            setBankDetails(null);
            setCryptoAddress(null);
            setCryptoStatus('PENDING');
            setMethod(isCrypto ? 'crypto' : 'card');
        }
    }, [isOpen, isCrypto]);

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

        setLoading(true);
        try {
            const result = await walletApi.initializePayment({
                amount: parseFloat(amount),
                currency: selectedCurrency,
                options: { isCrypto: true }
            });
            
            setCryptoAddress({
                address: result.payAddress || '',
                reference: result.reference,
                paymentUrl: result.paymentUrl,
                network: selectedCurrency === 'BTC' ? 'Bitcoin' : 'Ethereum'
            });
            toast.success('Deposit address generated!');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to generate crypto address');
        } finally {
            setLoading(false);
        }
    };

    const handleCardDeposit = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        setLoading(true);
        try {
            const result = await walletApi.depositCard(selectedCurrency, parseFloat(amount));
            
            // Store reference for later status check
            localStorage.setItem('pendingDepositReference', result.reference);
            
            if (result.checkoutUrl) {
                // Redirect to Stripe Checkout
                toast.loading('Redirecting to payment...', { duration: 2000 });
                window.location.href = result.checkoutUrl;
            } else {
                toast.error('Payment initialization failed - no checkout URL received');
                setLoading(false);
            }
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Card deposit failed');
            setLoading(false);
        }
    };

    const handleBankDeposit = async () => {
        if (!amount || parseFloat(amount) <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        setLoading(true);
        try {
            const result = await walletApi.depositBank(selectedCurrency, parseFloat(amount));
            setBankDetails(result);
            toast.success('Bank transfer details generated!');
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Failed to generate bank details');
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
                className="modal-content relative overflow-hidden" 
                style={{ maxWidth: '520px' }}
            >
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500" />
                
                <button className="modal-close absolute right-4 top-6" onClick={onClose}>
                    <X size={20} />
                </button>
                
                <h2 className="text-2xl font-bold mb-2">Fund Digital Assets</h2>
                <p className="text-gray-400 text-sm mb-6 flex items-center gap-2">
                    <ShieldCheck size={16} className="text-green-500" />
                    Secure Payment Protocol
                </p>

                {/* Summary Card */}
                <div className="bg-gray-800/50 rounded-xl p-4 mb-6 border border-gray-700/50">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-gray-400 text-xs uppercase tracking-wider">Product</span>
                        <span className="text-white text-sm font-medium">Digital Assets Purchase</span>
                    </div>
                    <div className="flex justify-between items-end">
                        <span className="text-gray-400 text-xs uppercase tracking-wider">Total Amount</span>
                        <div className="text-right">
                            <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400">
                                {amount || '0.00'}
                            </span>
                            <span className="ml-2 text-gray-500 font-medium">{selectedCurrency}</span>
                        </div>
                    </div>
                </div>

                <div className="flex gap-2 mb-8 bg-gray-900/50 p-1 rounded-xl border border-gray-800">
                    {isFiat && (
                        <>
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
                                <Building2 size={18} />
                                <span className="text-sm font-medium">Bank</span>
                            </button>
                        </>
                    )}
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
                                            {selectedCurrency}
                                        </span>
                                    </div>
                                </div>
                                <Button onClick={handleCardDeposit} disabled={loading} className="w-full">
                                    {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : <CreditCard className="mr-2" size={18} />}
                                    Pay with Card
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
                                            {selectedCurrency}
                                        </span>
                                    </div>
                                </div>
                                <Button onClick={handleBankDeposit} disabled={loading} className="w-full">
                                    {loading ? <Loader2 className="animate-spin mr-2" size={18} /> : <ArrowRight className="mr-2" size={18} />}
                                    Get Bank Details
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
                                        <span className="text-gray-400">Account Name</span>
                                        <span className="font-medium">{bankDetails.bankDetails.accountName}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-gray-400">Reference</span>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-purple-400">{bankDetails.bankDetails.reference}</span>
                                            <button onClick={() => copyToClipboard(bankDetails.bankDetails.reference)}>
                                                <Copy size={16} className="text-gray-400 hover:text-white" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-sm text-yellow-400 text-center">
                                    Include the reference in your transfer description
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
                                        
                                        <Button onClick={onClose} variant="ghost" className="w-full text-gray-400 hover:text-white">
                                            Cancel & Close
                                        </Button>
                                    </>
                                )}
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>

                <div className="mt-8 pt-6 border-t border-gray-800/50 flex items-center justify-center gap-4 text-[10px] text-gray-500">
                    <div className="flex items-center gap-1">
                        <CheckCircle2 size={12} className="text-purple-500" />
                        PCI-DSS Compliant
                    </div>
                    <div className="flex items-center gap-1">
                        <CheckCircle2 size={12} className="text-purple-500" />
                        256-bit Encryption
                    </div>
                </div>
            </motion.div>
        </div>
    );
};
