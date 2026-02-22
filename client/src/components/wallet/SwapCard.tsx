import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, Loader2, RefreshCcw, Info } from 'lucide-react';
import { Button } from '../common/Button';
import { walletApi } from '../../lib/walletApi';
import { useWallet } from '../../hooks/useWallet';
import toast from 'react-hot-toast';
import type { Currency } from '@/types/wallet';
import { formatCurrency } from '../../lib/CurrencyFormatter';
import { motion } from 'framer-motion';

interface SwapCardProps {
    initialFromCurrency?: Currency;
    className?: string;
    onSuccess?: () => void;
}

const CURRENCIES: Currency[] = ['BTC', 'ETH', 'USD', 'NGN', 'EUR', 'GBP', 'JPY'];

export const SwapCard: React.FC<SwapCardProps> = ({ initialFromCurrency = 'BTC', className = '', onSuccess }) => {
    const { wallets, refresh } = useWallet();
    const [fromCurrency, setFromCurrency] = useState<Currency>(initialFromCurrency);
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
        if (numericAmount <= 0) return toast.error('Please enter a valid amount');
        if (numericAmount > Number(availableBalance || 0)) return toast.error('Insufficient balance');
        if (fromCurrency === toCurrency) return toast.error('Cannot swap same currency');

        setLoading(true);
        try {
            const idempotencyKey = `swap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const result = await walletApi.executeSwap(fromCurrency, toCurrency, numericAmount, idempotencyKey);
            
            toast.success(
                `Swapped ${formatCurrency(Number(result.amountIn ?? 0), result.fromCurrency)} → ${formatCurrency(Number(result.amountOut ?? 0), result.toCurrency)}`
            );
            setAmount('');
            setPreview(null);
            if (onSuccess) onSuccess();
            refresh();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Swap failed');
        } finally {
            setLoading(false);
        }
    };

    const numericAmount = Number(amount || 0);
    const isInsufficient = numericAmount > Number(availableBalance || 0) && numericAmount > 0;

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl ${className}`}
        >
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <RefreshCcw size={20} className="text-purple-500" />
                    Quick Swap
                </h2>
                <div className="bg-purple-500/10 text-purple-400 px-2 py-1 rounded text-xs font-medium border border-purple-500/20">
                    Instant
                </div>
            </div>

            <div className="space-y-4">
                {/* From Section */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 transition-colors focus-within:border-purple-500/50">
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-xs text-gray-400 font-medium uppercase tracking-wider">From</label>
                        <span className="text-xs text-gray-400">
                            Balance: {formatCurrency(Number(availableBalance || 0), fromCurrency)}
                        </span>
                    </div>
                    <div className="flex gap-3 items-center">
                        <select
                            id="swap-card-from-currency"
                            name="fromCurrency"
                            value={fromCurrency}
                            onChange={(e) => setFromCurrency(e.target.value as Currency)}
                            className="bg-transparent text-xl font-bold text-white focus:outline-none cursor-pointer hover:text-purple-400 transition-colors"
                        >
                            {CURRENCIES?.map(c => (
                                <option key={c} value={c} className="bg-gray-800 text-base">{c}</option>
                            ))}
                        </select>
                        <div className="flex-1 relative">
                            <input
                                id="swap-card-amount-in"
                                name="amountIn"
                                type="number"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                placeholder="0.00"
                                className="w-full bg-transparent text-right text-2xl font-bold text-white placeholder-gray-600 focus:outline-none"
                            />
                            <button
                                onClick={handleMaxAmount}
                                className="absolute right-0 -bottom-5 text-[10px] text-purple-400 uppercase tracking-wide font-bold hover:text-purple-300 transition-colors"
                            >
                                Max
                            </button>
                        </div>
                    </div>
                </div>

                {/* Swap Icon */}
                <div className="flex justify-center -my-2 relative z-10">
                    <button
                        onClick={handleSwapCurrencies}
                        className="p-2 rounded-full bg-gray-800 border border-gray-700 hover:border-purple-500 hover:bg-gray-700 transition-all shadow-lg group"
                    >
                        <ArrowRightLeft size={18} className="text-gray-400 group-hover:text-purple-400 transition-colors" />
                    </button>
                </div>

                {/* To Section */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 transition-colors focus-within:border-purple-500/50">
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-xs text-gray-400 font-medium uppercase tracking-wider">To</label>
                        {previewLoading && <Loader2 className="animate-spin text-purple-400" size={14} />}
                    </div>
                    <div className="flex gap-3 items-center">
                        <select
                            id="swap-card-to-currency"
                            name="toCurrency"
                            value={toCurrency}
                            onChange={(e) => setToCurrency(e.target.value as Currency)}
                            className="bg-transparent text-xl font-bold text-white focus:outline-none cursor-pointer hover:text-purple-400 transition-colors"
                        >
                            {CURRENCIES?.filter(c => c !== fromCurrency).map(c => (
                                <option key={c} value={c} className="bg-gray-800 text-base">{c}</option>
                            ))}
                        </select>
                        <div className="flex-1">
                            <input
                                id="swap-card-amount-out"
                                name="amountOut"
                                type="text"
                                value={preview ? Number(preview.amountOut || 0).toFixed(6) : ''}
                                readOnly
                                placeholder="0.00"
                                className="w-full bg-transparent text-right text-2xl font-bold text-gray-300 placeholder-gray-600 focus:outline-none"
                            />
                        </div>
                    </div>
                </div>

                {/* Info Section */}
                <div className="min-h-[60px]">
                    {preview ? (
                        <div className="bg-purple-900/10 border border-purple-500/10 rounded-lg p-3 text-xs space-y-1">
                            <div className="flex justify-between text-gray-400">
                                <span>Rate</span>
                                <span className="text-purple-300">1 {fromCurrency} ≈ {formatCurrency(Number(preview.rate || 0), toCurrency)}</span>
                            </div>
                            <div className="flex justify-between text-gray-400">
                                <span>Fee ({Number(preview.feePercentage || 0).toFixed(2)}%)</span>
                                <span>{formatCurrency(Number(preview.fee || 0), fromCurrency)}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-600 text-xs gap-2">
                            <Info size={14} />
                            Enter an amount to see quote
                        </div>
                    )}
                </div>

                <Button
                    onClick={handleExecuteSwap}
                    disabled={loading || !preview || isInsufficient}
                    className="w-full h-12 text-base font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 border-none shadow-lg shadow-purple-500/20"
                >
                    {loading ? (
                        <Loader2 className="animate-spin" size={20} />
                    ) : (
                        `Swap ${fromCurrency} → ${toCurrency}`
                    )}
                </Button>
                
                {isInsufficient && (
                    <p className="text-red-400 text-xs text-center font-medium animate-pulse">Insufficient {fromCurrency} balance</p>
                )}
            </div>
        </motion.div>
    );
};
