import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowRightLeft, Loader2, RefreshCcw, Info, Clock, TrendingUp, Zap } from 'lucide-react';
import { Button } from './common/Button';
import walletApi from '../api/walletApi';
import { useWallet } from '../hooks/useWallet';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import ReCAPTCHA from 'react-google-recaptcha';
import { normalizeAsset, parseOptionValue } from '../utils/assetUtils';

interface SwapCardProps {
    initialFromCurrency?: string;
    initialFromNetwork?: string;
    className?: string;
    onSuccess?: () => void;
}

export const SwapCard: React.FC<SwapCardProps> = ({ 
    initialFromCurrency = 'BTC', 
    initialFromNetwork = 'native',
    className = '', 
    onSuccess 
}) => {
    const { wallets, financialView, refresh } = useWallet();
    // const { isPro, isBusiness } = useAuth();
    
    const [fromCurrency, setFromCurrency] = useState<string>(initialFromCurrency);
    const [fromNetwork, setFromNetwork] = useState<string>(initialFromNetwork);
    const [toCurrency, setToCurrency] = useState<string>('USD');
    const [toNetwork, setToNetwork] = useState<string>('native');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [slippage] = useState<number>(0.5); 
    // const [showSlippageSettings, setShowSlippageSettings] = useState(false);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const [isTouched, setIsTouched] = useState(false);
    const recaptchaRef = useRef<ReCAPTCHA>(null);
    
    interface Preview {
        rate: number;
        fee: number;
        feePercentage: number;
        amountOut: number;
        lockId: string;
        expiresAt: number;
        metadata?: {
            fee_breakdown?: {
                rates?: { total?: number; admin?: number; referrer?: number; partner?: number; };
                breakdown?: { admin_fee?: number; referrer?: number; partner_reward?: number; };
            };
        } | null;
    }
    const [preview, setPreview] = useState<Preview | null>(null);
    const [timeLeft, setTimeLeft] = useState<number | null>(null);

    // DTO Selection Logic: Select the currently active 'From' and 'To' Views
    const fromView = useMemo(() => 
        financialView.wallets.find(w => w.asset === fromCurrency && w.network === fromNetwork),
    [financialView.wallets, fromCurrency, fromNetwork]);

    // const toView = useMemo(() => 
    //     financialView.wallets.find(w => w.asset === toCurrency && w.network === toNetwork),
    // [financialView.wallets, toCurrency, toNetwork]);

    // Countdown logic for rate lock
    useEffect(() => {
        if (!preview) return;
        const intervalId = setInterval(() => {
            const remaining = Math.max(0, Math.ceil((preview.expiresAt - Date.now()) / 1000));
            setTimeLeft(remaining);
            if (remaining === 0) {
                setPreview(null);
                toast.error('Swap quote expired. Please refresh.');
            }
        }, 1000);
        return () => clearInterval(intervalId);
    }, [preview]);

    // Auto-correct invalid default selections to match real wallets
    useEffect(() => {
        const safeWallets = financialView.wallets;
        if (safeWallets.length > 0) {
            const validFrom = safeWallets.find(w => w.asset === fromCurrency && w.network === fromNetwork);
            if (!validFrom) {
                const matchFromCurr = safeWallets.find(w => w.asset === fromCurrency);
                if (matchFromCurr) {
                    setFromNetwork(matchFromCurr.network || 'native');
                } else {
                    setFromCurrency(safeWallets[0].asset);
                    setFromNetwork(safeWallets[0].network || 'native');
                }
            }
            
            const validTo = safeWallets.find(w => w.asset === toCurrency && w.network === toNetwork);
            if (!validTo) {
                const possibleTos = safeWallets.filter(w => w.asset !== fromCurrency || w.network !== fromNetwork);
                if (possibleTos.length > 0) {
                    const matchToCurr = possibleTos.find(w => w.asset === toCurrency);
                    if (matchToCurr) {
                        setToNetwork(matchToCurr.network || 'native');
                    } else {
                        setToCurrency(possibleTos[0].asset);
                        setToNetwork(possibleTos[0].network || 'native');
                    }
                }
            }
        }
    }, [financialView.wallets, fromCurrency, fromNetwork, toCurrency, toNetwork]);

    const fetchPreview = useCallback(async () => {
        setPreviewLoading(true);
        try {
            const slippageDecimal = slippage / 100;
            const result = await walletApi.previewSwap(fromCurrency, toCurrency, parseFloat(amount), slippageDecimal, fromNetwork, toNetwork);
            setPreview({
                rate: Number(result.rate ?? 0),
                fee: Number(result.fee ?? 0),
                feePercentage: Number(result.feePercentage ?? 0),
                amountOut: Number(result.amountOut ?? 0),
                lockId: result.lockId,
                expiresAt: result.expiresAt,
                metadata: result.metadata
            });
        } catch (err) {
            console.error('Preview error:', err);
            setPreview(null);
        } finally {
            setPreviewLoading(false);
        }
    }, [fromCurrency, toCurrency, amount, slippage, fromNetwork, toNetwork]);

    useEffect(() => {
        const timeoutId = setTimeout(() => {
            const numericAmount = Number(amount || 0);
            if (numericAmount > 0 && fromCurrency !== toCurrency) {
                fetchPreview();
            } else {
                setPreview(null);
            }
        }, 800);
        return () => clearTimeout(timeoutId);
    }, [amount, fromCurrency, toCurrency, fetchPreview]);

    const handleSwapCurrencies = () => {
        const tempCurr = fromCurrency;
        const tempNet = fromNetwork;
        setFromCurrency(toCurrency);
        setFromNetwork(toNetwork);
        setToCurrency(tempCurr);
        setToNetwork(tempNet);
        setAmount('');
        setPreview(null);
        setCaptchaToken(null);
        recaptchaRef.current?.reset();
    };

    const handleMaxAmount = () => {
        // Truth comes from the raw wallet entry, but we use DTO display logic if needed.
        // For 'Max', we use the raw numeric Truth.
        const rawWallet = wallets.find(w => w.asset === fromCurrency && w.network === fromNetwork);
        const balance = Number(rawWallet?.available || 0);
        const floored = Math.floor(balance * 100000000) / 100000000;
        setAmount(floored.toString());
        setIsTouched(true);
    };

    const handleExecuteSwap = async () => {
        const numericAmount = Number(amount || 0);
        if (numericAmount <= 0) return toast.error('Please enter a valid amount');
        
        // Final Security Blockade: Check DTO 'canExecute'
        if (!fromView?.canExecute) {
            return toast.error('Exchange unavailable: Price data is stale or account is frozen.');
        }

        if (fromCurrency === toCurrency) return toast.error('Cannot swap same currency');
        if (!preview?.lockId) return toast.error('Please wait for a quote');

        if (!captchaToken && import.meta.env.PROD) {
            return toast.error('Please complete the reCAPTCHA verification');
        }

        setLoading(true);
        try {
            const idempotencyKey = `swap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const slippageDecimal = slippage / 100;
            await walletApi.executeSwap(
                fromCurrency, 
                toCurrency, 
                numericAmount, 
                idempotencyKey,
                preview.lockId,
                slippageDecimal,
                fromNetwork,
                toNetwork,
                captchaToken || undefined
            );
            
            toast.success(`Exchange successful!`);
            setAmount('');
            setPreview(null);
            setCaptchaToken(null);
            recaptchaRef.current?.reset();
            if (onSuccess) onSuccess();
            refresh();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Swap failed');
            setPreview(null); 
            setCaptchaToken(null);
            recaptchaRef.current?.reset();
        } finally {
            setLoading(false);
        }
    };

    const numericAmount = Number(amount || 0);
    const isError = isTouched && (numericAmount <= 0 || amount === '');

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className={`bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl ${className}`}
        >
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <RefreshCcw size={20} className="text-purple-500" />
                    Quick Exchange
                </h2>
                <div className="bg-purple-500/10 text-purple-400 px-2 py-1 rounded text-xs font-medium border border-purple-500/20">
                    {fromView?.mode === 'FRESH' ? 'Real-time' : 'Fixed-Rate'}
                </div>
            </div>

            <div className="space-y-4">
                {/* From Section */}
                <div className={`bg-gray-800/40 border-2 rounded-2xl p-4 transition-all duration-300 group/input ${
                    isError 
                        ? 'border-red-500/50 bg-red-500/5 ring-4 ring-red-500/10' 
                        : 'border-gray-700/50 hover:border-purple-500/30 focus-within:border-purple-500/50 focus-within:ring-4 focus-within:ring-purple-500/10 focus-within:bg-gray-800/80'
                }`}>
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500">You Send</span>
                        <div className="flex items-center gap-2">
                            <span 
                                onClick={handleMaxAmount}
                                className="text-[10px] font-bold text-gray-400 hover:text-purple-400 cursor-pointer transition-colors"
                            >
                                Balance: <span className="text-gray-300 font-mono">{fromView?.available || '0.00'}</span>
                            </span>
                            <button
                                onClick={handleMaxAmount}
                                className="px-2 py-0.5 text-[10px] font-black text-purple-400 uppercase bg-purple-500/10 rounded-lg hover:bg-purple-500 hover:text-white transition-all active:scale-95 border border-purple-500/20"
                            >
                                Max
                            </button>
                        </div>
                    </div>
                    
                    <div className="grid grid-cols-[1fr_100px] sm:grid-cols-[1fr_120px] gap-3 items-center w-full">
                        <div className="min-w-0">
                            <input
                                id="swap-card-amount-in"
                                name="amountIn"
                                type="text"
                                inputMode="decimal"
                                value={amount}
                                onBlur={() => setIsTouched(true)}
                                onChange={(e) => {
                                    const val = e.target.value.replace(/[^0-9.]/g, '');
                                    const parts = val.split('.');
                                    if (parts.length <= 2) setAmount(val);
                                }}
                                placeholder="0.00"
                                className="w-full bg-transparent text-xl sm:text-2xl font-black text-white placeholder-gray-700 focus:outline-none transition-all caret-purple-500 block"
                                autoComplete="off"
                            />
                        </div>
                        <div className="min-w-0 h-full flex items-center">
                            <select
                                id="swap-card-from-currency"
                                name="fromCurrency"
                                value={`${fromCurrency}_${fromNetwork}`}
                                onChange={(e) => {
                                    const { symbol, network } = parseOptionValue(e.target.value);
                                    setFromCurrency(symbol);
                                    setFromNetwork(network);
                                }}
                                style={{ fontSize: '10px' }}
                                className="w-full bg-gray-700/50 hover:bg-gray-700 border border-gray-600 rounded-xl px-1.5 py-1 text-white focus:outline-none cursor-pointer transition-all truncate font-bold uppercase tracking-tighter"
                            >
                                 {financialView.wallets.map(w => {
                                 const norm = normalizeAsset(w);
                                 return (
                                     <option key={norm.optionValue} value={norm.optionValue} className="bg-gray-800 text-sm">
                                         {norm.displayLabel}
                                     </option>
                                 );
                             })}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Swap Icon */}
                <div className="flex justify-center -my-2 relative z-10">
                    <button
                        type="button"
                        onClick={handleSwapCurrencies}
                        className="p-2 rounded-full bg-gray-800 border border-gray-700 hover:border-purple-500 hover:bg-gray-700 transition-all shadow-lg group"
                    >
                        <ArrowRightLeft size={18} className="text-gray-400 group-hover:text-purple-400 transition-colors" />
                    </button>
                </div>

                {/* To Section */}
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-4 transition-colors">
                    <div className="flex justify-between items-center mb-3">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 text-left">You Receive</span>
                        {previewLoading && <Loader2 className="animate-spin text-purple-400" size={12} />}
                    </div>
                    <div className="grid grid-cols-[1fr_100px] sm:grid-cols-[1fr_120px] gap-3 items-center w-full">
                        <div className="min-w-0">
                            <input
                                id="swap-card-amount-out"
                                name="amountOut"
                                type="text"
                                value={preview ? Number(preview.amountOut || 0).toLocaleString(undefined, { maximumFractionDigits: 8 }) : ''}
                                title={preview ? (preview.amountOut || 0).toString() : ''}
                                readOnly
                                placeholder="0.00"
                                className="w-full bg-transparent text-xl sm:text-2xl font-black text-gray-300 placeholder-gray-800 focus:outline-none block"
                            />
                        </div>
                        <div className="min-w-0 h-full flex items-center">
                            <select
                                id="swap-card-to-currency"
                                name="toCurrency"
                                value={`${toCurrency}_${toNetwork}`}
                                onChange={(e) => {
                                    const { symbol, network } = parseOptionValue(e.target.value);
                                    setToCurrency(symbol);
                                    setToNetwork(network);
                                }}
                                style={{ fontSize: '10px' }}
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-1.5 py-1 text-white focus:outline-none cursor-pointer transition-all truncate font-bold uppercase tracking-tighter"
                            >
                                 {financialView.wallets.filter(w => w.asset !== fromCurrency || w.network !== fromNetwork).map(w => {
                                     const norm = normalizeAsset(w);
                                     return (
                                         <option key={norm.optionValue} value={norm.optionValue} className="bg-gray-800 text-sm">
                                             {norm.displayLabel}
                                         </option>
                                     );
                                 })}
                            </select>
                        </div>
                    </div>
                </div>

                {/* Info Panel */}
                <div className="px-1 space-y-3">
                    {preview ? (
                        <div className="space-y-2.5 py-2">
                            <div className="flex justify-between items-center text-[11px] font-medium text-gray-500 uppercase tracking-tight">
                                <span className="flex items-center gap-1.5"><TrendingUp size={12} className="text-gray-600" /> Rate</span>
                                <span className="text-gray-300 font-mono">1 {fromCurrency} ≈ {Number(preview.rate || 0).toFixed(6)} {toCurrency}</span>
                            </div>
                            
                            <div className="flex justify-between items-center text-[11px] font-medium text-gray-500 uppercase tracking-tight">
                                <span className="flex items-center gap-1.5"><Zap size={12} className="text-gray-600" /> Fee</span>
                                <span className="text-gray-400">
                                    {Number(preview.fee || 0).toLocaleString(undefined, { maximumFractionDigits: 6 })} {fromCurrency} 
                                    <span className="ml-1 text-[10px] opacity-40">({((Number(preview.metadata?.fee_breakdown?.rates?.total) || 0.047) * 100).toFixed(1)}%)</span>
                                </span>
                            </div>

                            <div className="pt-2.5 flex justify-between items-center border-t border-gray-800/40 mt-1">
                                <div className="flex items-center gap-1.5 text-[10px] text-gray-600 uppercase font-black tracking-widest">
                                    <Clock size={10} />
                                    <span>Expires In</span>
                                </div>
                                <span className={`text-[10px] font-black font-mono px-2 py-0.5 rounded-md ${Number(timeLeft || 0) < 15 ? 'bg-red-500/10 text-red-400 animate-pulse' : 'bg-purple-500/10 text-purple-400'}`}>
                                    {timeLeft}S
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-600 text-[10px] gap-2 py-6 opacity-50 uppercase tracking-widest font-bold">
                            <Info size={12} />
                            {fromView?.mode === 'STALE' ? 'Market volatility detected' : 'Enter amount to swap'}
                        </div>
                    )}
                </div>

                {/* reCAPTCHA */}
                {preview && import.meta.env.PROD && (
                    <div className="flex justify-center p-2 bg-gray-800/30 rounded-xl border border-gray-800">
                        <ReCAPTCHA
                            ref={recaptchaRef}
                            sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'} 
                            onChange={(token) => setCaptchaToken(token)}
                            theme="dark"
                        />
                    </div>
                )}

                <Button
                    onClick={handleExecuteSwap}
                    disabled={loading || !preview || (!captchaToken && import.meta.env.PROD) || (timeLeft !== null && timeLeft <= 0) || !fromView?.canExecute}
                    className="w-full h-12 text-base font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 border-none shadow-lg shadow-purple-500/20"
                >
                    {loading ? (
                        <Loader2 className="animate-spin" size={20} />
                    ) : !fromView?.canExecute ? (
                        fromView?.isFrozen
                            ? 'Account Frozen — Contact Support'
                            : 'Exchange Suspended (Feed Offline)'
                    ) : (
                        `Exchange ${fromCurrency} → ${toCurrency}`
                    )}
                </Button>
                
                {fromView?.mode === 'STALE' && (
                    <p className="text-amber-400/70 text-[10px] text-center font-medium mt-2">
                        ⚠ Using cached price data (within 2h). Rate may differ slightly from live market.
                    </p>
                )}
                {fromView?.isFrozen && (
                    <p className="text-red-400 text-[10px] text-center font-medium mt-2">This account is frozen. Please contact support.</p>
                )}
            </div>
        </motion.div>
    );
};
