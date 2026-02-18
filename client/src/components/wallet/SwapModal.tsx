import React, { useState, useEffect } from 'react';
import { X, ArrowRightLeft, Loader2, RefreshCcw } from 'lucide-react';
import { Button } from '../common/Button';
import { walletApi } from '../../lib/walletApi';
import { useWallet } from '../../hooks/useWallet';
import toast from 'react-hot-toast';
import type { Currency } from '@/types/wallet';
import { formatCurrency } from '../../lib/CurrencyFormatter';

interface SwapModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialFromCurrency?: Currency;
    onSuccess: () => void;
}

const CURRENCIES: Currency[] = ['BTC', 'ETH', 'USD', 'NGN', 'EUR', 'GBP', 'JPY'];

export const SwapModal: React.FC<SwapModalProps> = ({ isOpen, onClose, initialFromCurrency, onSuccess }) => {
    const { wallets } = useWallet();
    const [fromCurrency, setFromCurrency] = useState<Currency>(initialFromCurrency || 'BTC');
    const [toCurrency, setToCurrency] = useState<Currency>('USD');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [preview, setPreview] = useState<{
        rate: number;
        fee: number;
        feePercentage: number;
        amountOut: number;
    } | null>(null);

    const fromWallet = wallets.find(w => w.currency === fromCurrency);
    const availableBalance = fromWallet ? (fromWallet.available_balance ?? fromWallet.balance) : 0;

    useEffect(() => {
        if (isOpen && initialFromCurrency) {
            setFromCurrency(initialFromCurrency);
            // Set default target currency
            const defaultTo = initialFromCurrency === 'BTC' ? 'USD' : 'BTC';
            setToCurrency(defaultTo);
        }
    }, [isOpen, initialFromCurrency]);

    // Auto-preview when amount changes
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            const numericAmount = Number(amount || 0);
            if (numericAmount > 0 && fromCurrency !== toCurrency) {
                fetchPreview();
            } else {
                setPreview(null);
            }
        }, 500); // Debounce 500ms

        return () => clearTimeout(timeoutId);
    }, [amount, fromCurrency, toCurrency]);

    const fetchPreview = async () => {
        setPreviewLoading(true);
        try {
            const result = await walletApi.previewSwap(fromCurrency, toCurrency, parseFloat(amount));
            setPreview({
                rate: Number(result.rate ?? 0),
                fee: Number(result.fee ?? 0),
                feePercentage: Number(result.feePercentage ?? 0),
                amountOut: Number(result.amountOut ?? 0)
            });
        } catch (err) {
            console.error('Preview error:', err);
            setPreview(null);
        } finally {
            setPreviewLoading(false);
        }
    };

    const handleSwapCurrencies = () => {
        const temp = fromCurrency;
        setFromCurrency(toCurrency);
        setToCurrency(temp);
        setAmount('');
        setPreview(null);
    };

    const handleMaxAmount = () => {
        setAmount(Number(availableBalance || 0).toString());
    };

    const handleExecuteSwap = async () => {
        const numericAmount = Number(amount || 0);
        if (numericAmount <= 0) {
            toast.error('Please enter a valid amount');
            return;
        }

        if (numericAmount > Number(availableBalance || 0)) {
            toast.error('Insufficient balance');
            return;
        }

        if (fromCurrency === toCurrency) {
            toast.error('Cannot swap same currency');
            return;
        }

        setLoading(true);
        try {
            const idempotencyKey = `swap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const result = await walletApi.executeSwap(fromCurrency, toCurrency, numericAmount, idempotencyKey);
            
            toast.success(
                `Swapped ${formatCurrency(Number(result.amountIn ?? 0), result.fromCurrency)} → ${formatCurrency(Number(result.amountOut ?? 0), result.toCurrency)}`,
                { duration: 5000 }
            );
            onSuccess();
            onClose();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Swap failed');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const numericAmount = Number(amount || 0);
    const isInsufficient = numericAmount > Number(availableBalance || 0) && numericAmount > 0;

    return (
        <div className="modal-overlay">
            <div className="modal-content max-w-[420px]">
                <button className="modal-close" onClick={onClose}>
                    <X size={20} />
                </button>
                
                <h2 className="modal-header">Swap Currencies</h2>

                <div className="modal-body space-y-4">
                    {/* From Currency */}
                    <div className="bg-gray-800 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-2">
                            <label htmlFor="swap-from-currency" className="text-sm text-gray-400 cursor-pointer">From</label>
                            <span className="text-sm text-gray-400">
                                Balance: {formatCurrency(Number(availableBalance || 0), fromCurrency)}
                            </span>
                        </div>
                        <div className="flex gap-3">
                            <select
                                id="swap-from-currency"
                                name="fromCurrency"
                                value={fromCurrency}
                                onChange={(e) => setFromCurrency(e.target.value as Currency)}
                                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none"
                            >
                                {CURRENCIES.map(c => {
                                    const wallet = wallets.find(w => w.currency === c);
                                    const balance = wallet ? (wallet.available_balance ?? wallet.balance) : 0;
                                    const isInsufficient = numericAmount > Number(balance || 0) && numericAmount > 0;
                                    return (
                                        <option key={c} value={c}>
                                            {c} - {formatCurrency(Number(balance || 0), c)}
                                            {isInsufficient ? ' - Insufficient' : ''}
                                        </option>
                                    );
                                })}
                            </select>
                            <div className="flex-1 relative">
                                <label htmlFor="swap-amount-in" className="sr-only">Amount to swap</label>
                                <input
                                    id="swap-amount-in"
                                    name="amountIn"
                                    type="number"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value)}
                                    placeholder="0.00"
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white text-right focus:border-purple-500 outline-none"
                                    autoComplete="off"
                                />
                                <button
                                    onClick={handleMaxAmount}
                                    className="absolute right-2 top-2 text-xs text-purple-400 hover:text-purple-300"
                                    aria-label="Use maximum balance"
                                >
                                    MAX
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Swap Button */}
                    <div className="flex justify-center">
                        <button
                            onClick={handleSwapCurrencies}
                            className="p-2 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors"
                            aria-label="Swap from and to currencies"
                        >
                            <ArrowRightLeft size={20} className="text-purple-400" />
                        </button>
                    </div>

                    {/* To Currency */}
                    <div className="bg-gray-800 rounded-lg p-4">
                        <div className="flex justify-between items-center mb-2">
                            <label htmlFor="swap-to-currency" className="text-sm text-gray-400 cursor-pointer">To</label>
                            {previewLoading && <Loader2 className="animate-spin text-purple-400" size={16} />}
                        </div>
                        <div className="flex gap-3">
                            <select
                                id="swap-to-currency"
                                name="toCurrency"
                                value={toCurrency}
                                onChange={(e) => setToCurrency(e.target.value as Currency)}
                                className="bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white focus:border-purple-500 outline-none"
                            >
                                {CURRENCIES.filter(c => c !== fromCurrency).map(c => {
                                    const wallet = wallets.find(w => w.currency === c);
                                    const balance = wallet ? (wallet.available_balance ?? wallet.balance) : 0;
                                    return (
                                        <option key={c} value={c}>
                                            {c} - {formatCurrency(Number(balance || 0), c)}
                                        </option>
                                    );
                                })}
                            </select>
                            <div className="flex-1">
                                <label htmlFor="swap-amount-out" className="sr-only">Estimated amount out</label>
                                <input
                                    id="swap-amount-out"
                                    name="amountOut"
                                    type="text"
                                    value={preview ? Number(preview.amountOut || 0).toFixed(8) : ''}
                                    readOnly
                                    placeholder="0.00"
                                    className="w-full bg-gray-700 border border-gray-600 rounded-lg p-2 text-white text-right outline-none"
                                    autoComplete="off"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Rate & Fee Info */}
                    {preview && (
                        <div className="bg-gray-800 rounded-lg p-3 space-y-2 text-sm">
                            <div className="flex justify-between text-gray-400">
                                <span>Exchange Rate</span>
                                <span>1 {fromCurrency} = {formatCurrency(Number(preview.rate || 0), toCurrency)}</span>
                            </div>
                            <div className="flex justify-between text-gray-400">
                                <span>Fee ({Number(preview.feePercentage || 0).toFixed(2)}%)</span>
                                <span>{formatCurrency(Number(preview.fee || 0), fromCurrency)}</span>
                            </div>
                            <div className="flex justify-between font-medium pt-2 border-t border-gray-700">
                                <span>You'll receive</span>
                                <span className="text-green-400">{formatCurrency(Number(preview.amountOut || 0), toCurrency)}</span>
                            </div>
                        </div>
                    )}

                    {/* Execute Button */}
                    <Button
                        onClick={handleExecuteSwap}
                        disabled={loading || !preview || isInsufficient}
                        className="w-full"
                    >
                        {loading ? (
                            <>
                                <Loader2 className="animate-spin mr-2" size={18} />
                                Swapping...
                            </>
                        ) : (
                            <>
                                <RefreshCcw className="mr-2" size={18} />
                                Swap {fromCurrency} to {toCurrency}
                            </>
                        )}
                    </Button>

                    {isInsufficient && (
                        <p className="text-red-400 text-sm text-center">Insufficient {fromCurrency} balance</p>
                    )}
                </div>
            </div>
        </div>
    );
};
