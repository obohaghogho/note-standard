import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ArrowRightLeft, Loader2, RefreshCcw, Info, Clock } from 'lucide-react';
import { Button } from './common/Button';
import walletApi from '../api/walletApi';
import { useWallet } from '../hooks/useWallet';
import toast from 'react-hot-toast';
// import type { WalletViewDTO } from '@/types/wallet';
import { motion } from 'framer-motion';
import ReCAPTCHA from 'react-google-recaptcha';

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
                <div className={`bg-gray-800/50 border rounded-xl p-4 transition-all duration-200 focus-within:ring-2 focus-within:bg-gray-800/80 ${
                    isError 
                        ? 'border-red-500/50 focus-within:border-red-500 ring-red-500/10' 
                        : 'border-gray-700/80 focus-within:border-purple-500/50 focus-within:ring-purple-500/10'
                }`}>
                    <div className="flex justify-between items-center mb-1">
                        <label htmlFor="swap-card-from-currency" className="text-xs text-gray-400 font-medium uppercase tracking-wider">From</label>
                        <span className={`text-xs font-medium text-gray-400`}>
                            Balance: {fromView?.available || '...'}
                        </span>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
                        <div className="flex w-full sm:w-auto items-center">
                            <select
                                id="swap-card-from-currency"
                                name="fromCurrency"
                                value={`${fromCurrency}_${fromNetwork}`}
                                onChange={(e) => {
                                    const [c, n] = e.target.value.split('_');
                                    setFromCurrency(c);
                                    setFromNetwork(n);
                                }}
                                className="bg-transparent text-xl font-bold text-white focus:outline-none cursor-pointer hover:text-purple-400 transition-colors w-full"
                            >
                                 {financialView.wallets.map(w => (
                                     <option key={`${w.asset}_${w.network}`} value={`${w.asset}_${w.network}`} className="bg-gray-800 text-base">
                                         {w.asset} {w.network !== 'native' ? `(${w.network})` : ''}
                                     </option>
                                 ))}
                            </select>
                        </div>
                        <div className="flex-1 w-full relative flex flex-col group/input min-w-0">
                            <div className="relative flex items-center">
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
                                    className="w-full bg-transparent text-left sm:text-right text-2xl font-bold text-white placeholder-gray-600 focus:outline-none pr-12 transition-all caret-purple-500"
                                    autoComplete="off"
                                />
                                <button
                                    onClick={handleMaxAmount}
                                    className="absolute right-0 px-2 py-1 text-[10px] text-purple-400 uppercase tracking-widest font-black hover:text-white hover:bg-purple-600 transition-all bg-purple-500/10 rounded-md border border-purple-500/30 hover:shadow-[0_0_15px_rgba(147,51,234,0.3)] active:scale-95 z-10"
                                >
                                    Max
                                </button>
                            </div>
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
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 transition-colors focus-within:border-purple-500/50">
                    <div className="flex justify-between items-center mb-2">
                        <label htmlFor="swap-card-to-currency" className="text-xs text-gray-400 font-medium uppercase tracking-wider">To</label>
                        {previewLoading && <Loader2 className="animate-spin text-purple-400" size={14} />}
                    </div>
                    <div className="flex gap-3 items-center">
                        <select
                            id="swap-card-to-currency"
                            name="toCurrency"
                            value={`${toCurrency}_${toNetwork}`}
                            onChange={(e) => {
                                const [c, n] = e.target.value.split('_');
                                setToCurrency(c);
                                setToNetwork(n);
                            }}
                            className="bg-transparent text-xl font-bold text-white focus:outline-none cursor-pointer hover:text-purple-400 transition-colors py-1"
                        >
                             {financialView.wallets.filter(w => w.asset !== fromCurrency || w.network !== fromNetwork).map(w => (
                                 <option key={`${w.asset}_${w.network}`} value={`${w.asset}_${w.network}`} className="bg-gray-800 text-base">
                                     {w.asset} {w.network !== 'native' ? `(${w.network})` : ''}
                                 </option>
                             ))}
                        </select>
                        <div className="flex-1 min-w-0">
                            <input
                                id="swap-card-amount-out"
                                name="amountOut"
                                type="text"
                                value={preview ? Number(preview.amountOut || 0).toFixed(6) : ''}
                                readOnly
                                placeholder="0.00"
                                className="w-full bg-transparent text-right text-2xl font-bold text-gray-300 placeholder-gray-600 focus:outline-none pr-2 caret-purple-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Info Section */}
                <div className="min-h-[60px]">
                    {preview ? (
                        <div className="bg-purple-900/10 border border-purple-500/10 rounded-lg p-3 text-xs space-y-1">
                            <div className="flex justify-between text-gray-400">
                                <span>Verified Rate</span>
                                <span className="text-purple-300">1 {fromCurrency} ≈ {Number(preview.rate || 0).toFixed(6)} {toCurrency}</span>
                            </div>
                            <div className="flex justify-between text-gray-400">
                                <div className="flex items-center gap-1.5">
                                    <span>Exchange Fee ({((Number(preview.metadata?.fee_breakdown?.rates?.total) || 0.047) * 100).toFixed(1)}%)</span>
                                </div>
                                <span>{Number(preview.fee || 0).toFixed(6)} {fromCurrency}</span>
                            </div>
                            
                            <div className="flex justify-between items-center pt-1 border-t border-purple-500/10 mt-1">
                                <span className="text-gray-500 flex items-center gap-1">
                                    <Clock size={10} />
                                    Quote expires in
                                </span>
                                <span className={`font-mono font-bold ${Number(timeLeft || 0) < 10 ? 'text-red-400' : 'text-purple-400'}`}>
                                    {timeLeft}s
                                </span>
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center h-full text-gray-600 text-xs gap-2 py-2">
                            <Info size={14} />
                            {fromView?.mode === 'STALE' ? 'Prices are updating. Swaps temporarily blocked.' : 'Enter an amount to see quote'}
                        </div>
                    )}
                </div>

                {/* reCAPTCHA */}
                {preview && (
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
                        'Exchange Blocked'
                    ) : (
                        `Exchange ${fromCurrency} → ${toCurrency}`
                    )}
                </Button>
                
                {fromView?.mode === 'STALE' && (
                    <p className="text-amber-400 text-[10px] text-center font-medium animate-pulse mt-2">Market volatility detected. Executions paused for safety.</p>
                )}
            </div>
        </motion.div>
    );
};
