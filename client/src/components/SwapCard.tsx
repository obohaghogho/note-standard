import React, { useState, useEffect } from 'react';
import { ArrowRightLeft, Loader2, RefreshCcw, Info, Clock, Zap, ShieldCheck } from 'lucide-react';
import { Button } from './common/Button';
import walletApi from '../api/walletApi';
import { useWallet } from '../hooks/useWallet';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import type { Currency, ExchangeRates } from '@/types/wallet';
import { formatCurrency } from '../lib/CurrencyFormatter';
import { motion } from 'framer-motion';
import ReCAPTCHA from 'react-google-recaptcha';
interface SwapCardProps {
    initialFromCurrency?: Currency;
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
    const { wallets, refresh } = useWallet();
    const { isPro, isBusiness } = useAuth();
    const [fromCurrency, setFromCurrency] = useState<Currency>(initialFromCurrency);
    const [fromNetwork, setFromNetwork] = useState<string>(initialFromNetwork);
    const [toCurrency, setToCurrency] = useState<Currency>('USD');
    const [toNetwork, setToNetwork] = useState<string>('native');
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [slippage, setSlippage] = useState<number>(0.5); // Default 0.5%
    const [showSlippageSettings, setShowSlippageSettings] = useState(false);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const [rates, setRates] = useState<ExchangeRates>({});
    const [isTouched, setIsTouched] = useState(false);
    const recaptchaRef = React.useRef<ReCAPTCHA>(null);
    
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

    const safeWallets = React.useMemo(() => Array.isArray(wallets) ? wallets : [], [wallets]);
    const fromWallet = safeWallets.find(w => w.currency === fromCurrency && w.network === fromNetwork);
    // Robust balance check: detect desync (available=0 but balance>0)
    const availableBalance = fromWallet 
        ? (fromWallet.available_balance > 0 ? fromWallet.available_balance : fromWallet.balance) 
        : 0;
    const isDesynced = fromWallet && Number(fromWallet.available_balance) === 0 && Number(fromWallet.balance) > 0;

    // Auto-correct invalid default selections to match real wallets
    useEffect(() => {
        if (safeWallets.length > 0) {
            const validFrom = safeWallets.some(w => w.currency === fromCurrency && w.network === fromNetwork);
            if (!validFrom) {
                const matchFromCurr = safeWallets.find(w => w.currency === fromCurrency);
                if (matchFromCurr) {
                    setFromNetwork(matchFromCurr.network);
                } else {
                    setFromCurrency(safeWallets[0].currency);
                    setFromNetwork(safeWallets[0].network);
                }
            }
            
            const validTo = safeWallets.some(w => w.currency === toCurrency && w.network === toNetwork);
            if (!validTo) {
                const possibleTos = safeWallets.filter(w => w.currency !== (validFrom ? fromCurrency : safeWallets[0]?.currency) || w.network !== (validFrom ? fromNetwork : safeWallets[0]?.network));
                if (possibleTos.length > 0) {
                    const matchToCurr = possibleTos.find(w => w.currency === toCurrency);
                    if (matchToCurr) {
                        setToNetwork(matchToCurr.network);
                    } else {
                        setToCurrency(possibleTos[0].currency);
                        setToNetwork(possibleTos[0].network);
                    }
                }
            }
        }
    }, [safeWallets, fromCurrency, fromNetwork, toCurrency, toNetwork]);

    // Fetch global rates once on mount for instant fiat estimates
    useEffect(() => {
        const fetchRates = async () => {
            try {
                const result = await walletApi.getExchangeRates();
                setRates(result);
            } catch (err) {
                console.error('Failed to fetch exchange rates:', err);
            }
        };
        fetchRates();
    }, []);

    const fetchPreview = React.useCallback(async () => {
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

    // Auto-correct invalid default selections to match real wallets
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            const numericAmount = Number(amount || 0);
            if (numericAmount > 0 && fromCurrency !== toCurrency) {
                fetchPreview();
            } else {
                setPreview(null);
            }
        }, 800); // Increased debounce to prevent rapid API calls

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
        const balance = Number(availableBalance || 0);
        // Floor to 8 decimals to avoid rounding up and triggering insufficiency
        const floored = Math.floor(balance * 100000000) / 100000000;
        setAmount(floored.toString());
        setIsTouched(true); // Ensure error state is updated
    };

    const handleExecuteSwap = async () => {
        const numericAmount = Number(amount || 0);
        if (numericAmount <= 0) return toast.error('Please enter a valid amount');
        
        // Inclusion fee logic: Just check if amount > balance
        if (numericAmount > Number(availableBalance || 0) + 0.0000000001) {
            return toast.error('Insufficient balance');
        }

        if (fromCurrency === toCurrency) return toast.error('Cannot swap same currency');
        if (!preview?.lockId) return toast.error('Please wait for a quote');

        // Security: Demand reCAPTCHA for financial swaps
        if (!captchaToken && import.meta.env.PROD) {
            return toast.error('Please complete the reCAPTCHA verification');
        }

        setLoading(true);
        try {
            const idempotencyKey = `swap_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const slippageDecimal = slippage / 100;
            const result = await walletApi.executeSwap(
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
            
            toast.success(
                `Swapped ${formatCurrency(Number(result.amountIn ?? 0), result.fromCurrency)} → ${formatCurrency(Number(result.amountOut ?? 0), result.toCurrency)}`
            );
            setAmount('');
            setPreview(null);
            setCaptchaToken(null);
            recaptchaRef.current?.reset();
            if (onSuccess) onSuccess();
            refresh();
        } catch (err: unknown) {
            toast.error(err instanceof Error ? err.message : 'Swap failed');
            setPreview(null); // Force refresh quote on failure
            setCaptchaToken(null);
            recaptchaRef.current?.reset();
        } finally {
            setLoading(false);
        }
    };

    const numericAmount = Number(amount || 0);
    const isInsufficient = numericAmount > (Number(availableBalance || 0) + 0.0000000001) && numericAmount > 0;
    const isError = isTouched && (numericAmount <= 0 || amount === '');

    // Instant USD equivalent calculation
    const fromUsdRate = rates[fromCurrency]?.['USD'] || 0;
    const fiatEquivalent = numericAmount * fromUsdRate;

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
                    Instant
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
                        <span className={`text-xs font-medium ${isDesynced ? 'text-amber-400' : 'text-gray-400'}`}>
                            Balance: {formatCurrency(Number(availableBalance || 0), fromCurrency)}
                            {isDesynced && (
                                <span className="ml-1 inline-flex items-center" title="Balance synchronization in progress">
                                    <Info size={10} className="animate-pulse" />
                                </span>
                            )}
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
                                 {safeWallets.map(w => (
                                     <option key={`${w.currency}_${w.network}`} value={`${w.currency}_${w.network}`} className="bg-gray-800 text-base">
                                         {w.currency} {w.network !== 'native' ? `(${w.network})` : ''}
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
                                        // Ensure only one decimal point
                                        const parts = val.split('.');
                                        if (parts.length <= 2) {
                                            setAmount(val);
                                        }
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
                            {/* Instant USD equivalent */}
                            {numericAmount > 0 && fromUsdRate > 0 && (
                                <motion.div 
                                    initial={{ opacity: 0, x: 10 }}
                                    animate={{ opacity: 0.6, x: 0 }}
                                    className="text-[10px] text-gray-400 text-left sm:text-right mt-0.5"
                                >
                                    ≈ {formatCurrency(fiatEquivalent, 'USD')}
                                </motion.div>
                            )}
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
                             {safeWallets.filter(w => w.currency !== fromCurrency || w.network !== fromNetwork).map(w => (
                                 <option key={`${w.currency}_${w.network}`} value={`${w.currency}_${w.network}`} className="bg-gray-800 text-base">
                                     {w.currency} {w.network !== 'native' ? `(${w.network})` : ''}
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
                                <span>Rate</span>
                                <span className="text-purple-300">1 {fromCurrency} ≈ {formatCurrency(Number(preview.rate || 0), toCurrency)}</span>
                            </div>
                            <div className="flex justify-between text-gray-400">
                                <div className="flex items-center gap-1.5">
                                    <span>Processing Fee ({((Number(preview.metadata?.fee_breakdown?.rates?.total) || 0.047) * 100).toFixed(1)}%)</span>
                                    {isBusiness ? (
                                        <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded-[4px] border border-blue-500/20 text-[9px] font-bold flex items-center gap-0.5">
                                            <ShieldCheck size={8} />
                                            50% Business Discount
                                        </span>
                                    ) : isPro ? (
                                        <span className="bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded-[4px] border border-purple-500/20 text-[9px] font-bold flex items-center gap-0.5">
                                            <Zap size={8} />
                                            20% Pro Discount
                                        </span>
                                    ) : null}
                                </div>
                                <span>{formatCurrency(Number(preview.fee || 0), fromCurrency)}</span>
                            </div>
                            
                            {/* Detailed breakdown */}
                            <div className="grid grid-cols-2 gap-y-0.5 text-[9px] text-gray-500 pt-1 border-t border-purple-500/5">
                                <span>Platform ({(Number(preview.metadata?.fee_breakdown?.rates?.admin || 0.045) * 100).toFixed(1)}%)</span>
                                <span className="text-right">{formatCurrency(Number(preview.metadata?.fee_breakdown?.breakdown?.admin_fee || 0), fromCurrency)}</span>
                                
                                {Number(preview.metadata?.fee_breakdown?.rates?.referrer || 0) > 0 && (
                                    <>
                                        <span>Referrer ({(Number(preview.metadata?.fee_breakdown?.rates?.referrer) * 100).toFixed(1)}%)</span>
                                        <span className="text-right">{formatCurrency(Number(preview.metadata?.fee_breakdown?.breakdown?.referrer || 0), fromCurrency)}</span>
                                    </>
                                )}
                                
                                <span>Reward ({(Number(preview.metadata?.fee_breakdown?.rates?.partner || 0.001) * 100).toFixed(1)}%)</span>
                                <span className="text-right">{formatCurrency(Number(preview.metadata?.fee_breakdown?.breakdown?.partner_reward || 0), fromCurrency)}</span>
                            </div>

                            <div className="flex justify-between text-xs text-gray-500 pt-1">
                                <span>Max Slippage</span>
                                <span>{slippage}%</span>
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
                        <div className="flex items-center justify-center h-full text-gray-600 text-xs gap-2">
                            <Info size={14} />
                            Enter an amount to see quote
                        </div>
                    )}
                </div>

                {/* Advanced Settings (Slippage) */}
                <div className="pt-1">
                    <button 
                        onClick={() => setShowSlippageSettings(!showSlippageSettings)}
                        className="text-[10px] text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors uppercase tracking-wider font-bold"
                    >
                        Advanced Settings {showSlippageSettings ? '▲' : '▼'}
                    </button>
                    
                    {showSlippageSettings && (
                        <motion.div 
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            className="mt-2 p-3 bg-gray-800/50 rounded-lg border border-gray-700/50"
                        >
                            <div className="text-[10px] text-gray-400 mb-2 uppercase tracking-wide">Slippage Tolerance</div>
                            <div className="flex gap-2">
                                {[0.1, 0.5, 1.0].map((val) => (
                                    <button
                                        key={val}
                                        onClick={() => setSlippage(val)}
                                        className={`px-2 py-1 text-xs rounded transition-colors font-medium ${
                                            slippage === val 
                                                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/20' 
                                                : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-gray-700'
                                        }`}
                                    >
                                        {val}%
                                    </button>
                                ))}
                                <div className="flex-1 relative">
                                    <input
                                        id="swap-slippage-input"
                                        name="slippage"
                                        type="number"
                                        value={slippage}
                                        onChange={(e) => setSlippage(parseFloat(e.target.value) || 0)}
                                        step="0.1"
                                        className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1 text-xs text-right text-white focus:outline-none focus:border-purple-500 transition-colors"
                                    />
                                    <span className="absolute right-2 top-1.5 text-[10px] text-gray-500">%</span>
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* reCAPTCHA for Financial Security */}
                {preview && (
                    <div className="flex justify-center p-2 bg-gray-800/30 rounded-xl border border-gray-800">
                        <ReCAPTCHA
                            ref={recaptchaRef}
                            sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'} // Generic test key for dev
                            onChange={(token) => setCaptchaToken(token)}
                            theme="dark"
                        />
                    </div>
                )}

                <Button
                    onClick={handleExecuteSwap}
                    disabled={loading || !preview || (!captchaToken && import.meta.env.PROD) || (timeLeft !== null && timeLeft <= 0)}
                    className="w-full h-12 text-base font-bold bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 border-none shadow-lg shadow-purple-500/20"
                >
                    {loading ? (
                        <Loader2 className="animate-spin" size={20} />
                    ) : (
                        `Exchange ${fromCurrency} → ${toCurrency}`
                    )}
                </Button>
                
                {isInsufficient && (
                    <p className="text-red-400 text-xs text-center font-medium animate-pulse">Insufficient {fromCurrency} balance</p>
                )}
                {isError && (
                    <p className="text-red-400 text-[10px] text-center font-medium">Please enter a valid amount greater than 0</p>
                )}
            </div>
        </motion.div>
    );
};
