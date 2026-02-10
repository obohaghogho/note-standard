import React, { useState, useEffect } from 'react';
import { X, CreditCard, Building2, Bitcoin, Copy, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '../common/Button';
import { walletApi } from '../../lib/walletApi';
import toast from 'react-hot-toast';
import type { Currency } from '@/types/wallet';
import { formatCurrency } from '../../lib/CurrencyFormatter';

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
        network: string;
        minDeposit: number;
    } | null>(null);

    const isCrypto = selectedCurrency === 'BTC' || selectedCurrency === 'ETH';
    const isFiat = !isCrypto; // Broaden to allow EUR, GBP, etc.

    useEffect(() => {
        // Reset state when modal opens
        if (isOpen) {
            setAmount('');
            setBankDetails(null);
            setCryptoAddress(null);
            setMethod(isCrypto ? 'crypto' : 'card');
        }
    }, [isOpen, isCrypto]);

    useEffect(() => {
        // Auto-fetch crypto address when crypto method selected
        if (method === 'crypto' && isCrypto && !cryptoAddress) {
            fetchCryptoAddress();
        }
    }, [method, isCrypto, selectedCurrency]);

    const fetchCryptoAddress = async () => {
        setLoading(true);
        try {
            const result = await walletApi.getCryptoDepositAddress(selectedCurrency);
            setCryptoAddress(result);
        } catch (err) {
            toast.error('Failed to get deposit address');
            console.error(err);
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
        // Note: Don't setLoading(false) on success - we're redirecting
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
            <div className="modal-content" style={{ maxWidth: '480px' }}>
                <button className="modal-close" onClick={onClose}>
                    <X size={20} />
                </button>
                
                <h2 className="text-xl font-bold mb-6">Fund {selectedCurrency} Wallet</h2>

                {/* Method Tabs */}
                <div className="flex gap-2 mb-6">
                    {isFiat && (
                        <>
                            <button
                                onClick={() => setMethod('card')}
                                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                                    method === 'card' 
                                        ? 'border-purple-500 bg-purple-500/10 text-purple-400' 
                                        : 'border-gray-700 hover:border-gray-600'
                                }`}
                            >
                                <CreditCard size={20} />
                                Card
                            </button>
                            <button
                                onClick={() => setMethod('bank')}
                                className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                                    method === 'bank' 
                                        ? 'border-purple-500 bg-purple-500/10 text-purple-400' 
                                        : 'border-gray-700 hover:border-gray-600'
                                }`}
                            >
                                <Building2 size={20} />
                                Bank
                            </button>
                        </>
                    )}
                    {isCrypto && (
                        <button
                            onClick={() => setMethod('crypto')}
                            className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${
                                method === 'crypto' 
                                    ? 'border-purple-500 bg-purple-500/10 text-purple-400' 
                                    : 'border-gray-700 hover:border-gray-600'
                            }`}
                        >
                            <Bitcoin size={20} />
                            Crypto
                        </button>
                    )}
                </div>

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
                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="animate-spin text-purple-500" size={32} />
                            </div>
                        ) : cryptoAddress ? (
                            <>
                                <div className="bg-gray-800 rounded-lg p-4 space-y-3">
                                    <div className="text-center mb-4">
                                        <span className="text-sm text-gray-400">Network</span>
                                        <p className="font-medium">{cryptoAddress.network}</p>
                                    </div>
                                    <div className="text-center">
                                        <span className="text-sm text-gray-400">Deposit Address</span>
                                        <div className="flex items-center justify-center gap-2 mt-2">
                                            <code className="font-mono text-sm bg-gray-900 px-3 py-2 rounded break-all">
                                                {cryptoAddress.address}
                                            </code>
                                            <button onClick={() => copyToClipboard(cryptoAddress.address)}>
                                                <Copy size={18} className="text-gray-400 hover:text-white" />
                                            </button>
                                        </div>
                                    </div>
                                </div>
                                <p className="text-sm text-yellow-400 text-center">
                                    Minimum deposit: {formatCurrency(cryptoAddress.minDeposit, selectedCurrency)}
                                </p>
                                <Button onClick={onClose} variant="secondary" className="w-full">
                                    Done
                                </Button>
                            </>
                        ) : (
                            <p className="text-center text-gray-400">Failed to load address</p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
