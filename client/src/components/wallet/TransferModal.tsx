import React, { useState, useEffect } from 'react';
import { X, Send, Loader2, User, Wallet as WalletIcon } from 'lucide-react';
import { Button } from '../common/Button';
import { useWallet } from '../../hooks/useWallet';
import { formatCurrency } from '../../lib/CurrencyFormatter';
import type { Currency } from '@/types/wallet';
import { motion, AnimatePresence } from 'framer-motion';
import ReCAPTCHA from 'react-google-recaptcha';

interface TransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedCurrency: Currency;
    selectedNetwork?: string;
    onSuccess: () => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({ 
    isOpen, 
    onClose, 
    selectedCurrency, 
    selectedNetwork = 'native',
    onSuccess 
}) => {
    const { sendFunds, getCommissionRate, wallets } = useWallet();
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [transferFee, setTransferFee] = useState<{ fee: number, net: number } | null>(null);
    const [captchaToken, setCaptchaToken] = useState<string | null>(null);
    const recaptchaRef = React.useRef<ReCAPTCHA>(null);

    const wallet = wallets.find(w => w.currency === selectedCurrency && w.network === selectedNetwork);
    const availableBalance = wallet ? (wallet.available_balance ?? wallet.balance) : 0;

    useEffect(() => {
        if (isOpen) {
            setRecipient('');
            setAmount('');
            setTransferFee(null);
        }
    }, [isOpen]);

    useEffect(() => {
        const calculateFee = async () => {
            if (!amount || isNaN(parseFloat(amount))) {
                setTransferFee(null);
                return;
            }
                const val = parseFloat(amount);
                const isEmail = recipient.includes('@');
                const isAddress = !isEmail && (recipient.startsWith('0x') || recipient.startsWith('bc1') || recipient.startsWith('T') || recipient.length > 30);
                
                const type = isAddress ? 'WITHDRAWAL' : 'TRANSFER_OUT';
                const settings = await getCommissionRate(type, selectedCurrency);
                
                let fee = 0;
                if (settings && settings.length > 0) {
                    const s = settings[0];
                    if (s.commission_type === 'PERCENTAGE') {
                        const rateValue = s.value > 1 ? s.value / 100 : s.value;
                        fee = val * rateValue;
                    } else {
                        fee = s.value;
                    }
                    if (s.min_fee && fee < s.min_fee) fee = s.min_fee;
                    if (s.max_fee && fee > s.max_fee) fee = s.max_fee;
                }
                setTransferFee({ fee, net: val + fee });
        };
        calculateFee();
    }, [amount, recipient, selectedCurrency, getCommissionRate]);

    const handleSend = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!amount || !recipient) return;
        if (parseFloat(amount) > availableBalance) return;
        
        // reCAPTCHA check
        if (!captchaToken && import.meta.env.PROD) {
            // toast handles the error if needed
            return;
        }

        setIsSending(true);
        try {
            const isEmail = recipient.includes('@');
            const isAddress = !isEmail && (recipient.startsWith('0x') || recipient.startsWith('bc1') || recipient.startsWith('T') || recipient.length > 30);

            await sendFunds({
                currency: selectedCurrency,
                amount: parseFloat(amount),
                recipientEmail: isEmail ? recipient : undefined,
                recipientAddress: isAddress ? recipient : undefined,
                recipientId: (!isEmail && !isAddress) ? recipient : undefined,
                captchaToken: captchaToken || undefined
            });
            onSuccess();
            onClose();
        } catch (err) {
            setCaptchaToken(null);
            recaptchaRef.current?.reset();
        } finally {
            setIsSending(false);
        }
    };

    const handleMax = async () => {
        const bal = parseFloat(String(availableBalance || 0));
        if (bal <= 0) {
            setAmount('0');
            return;
        }

        const isEmail = recipient.includes('@');
        const isAddress = !isEmail && (recipient.startsWith('0x') || recipient.startsWith('bc1') || recipient.startsWith('T') || recipient.length > 30);
        
        // Internal transfers are free, external transfers (address) have withdrawal fees
        if (!isAddress) {
            setAmount(bal.toString());
            return;
        }

        const SAFETY_BUFFER = 0.000001;
        try {
            const settings = await getCommissionRate('WITHDRAWAL', selectedCurrency);
            let maxAmount = bal;
            
            if (settings && settings.length > 0) {
                const s = settings[0];
                const rateValue = s.value > 1 ? s.value / 100 : s.value;

                if (s.commission_type === 'PERCENTAGE') {
                    // amount + amount * rate = balance => amount = balance / (1 + rate)
                    maxAmount = bal / (1 + rateValue) - SAFETY_BUFFER;
                } else {
                    maxAmount = Math.max(0, bal - s.value - SAFETY_BUFFER);
                }

                // Check for min/max fee constraints
                let estimatedFee = bal - maxAmount;
                if (s.min_fee && estimatedFee < s.min_fee) {
                    maxAmount = bal - s.min_fee - SAFETY_BUFFER;
                } else if (s.max_fee && estimatedFee > s.max_fee) {
                    maxAmount = bal - s.max_fee - SAFETY_BUFFER;
                }
            } else {
                maxAmount = bal - SAFETY_BUFFER;
            }

            // Professional precision: 8 decimals for all crypto tokens
            const isCrypto = ['BTC', 'ETH', 'USDT', 'USDC', 'TRC20', 'ERC20', 'BEP20', 'POLYGON'].some(c => selectedCurrency.includes(c));
            const precision = isCrypto ? 8 : 2;
            const factor = Math.pow(10, precision);
            const flooredMax = Math.floor(maxAmount * factor) / factor;
            
            setAmount(flooredMax > 0 ? flooredMax.toFixed(precision).replace(/\.?0+$/, '') : '0');
        } catch (err) {
            console.error('Error calculating max transfer:', err);
            setAmount(bal.toString());
        }
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="modal-content max-w-[480px]"
            >
                <button onClick={onClose} className="modal-close">
                    <X size={20} />
                </button>

                <h2 className="modal-header">
                    <Send size={20} className="text-blue-500" />
                    Send {selectedCurrency} {selectedNetwork !== 'native' ? `(${selectedNetwork})` : ''}
                </h2>
                
                <form onSubmit={handleSend} className="modal-body flex flex-col gap-5">
                    <div className="space-y-1">
                        <label htmlFor="transfer-recipient" className="text-sm text-gray-400 font-medium ml-1">Recipient</label>
                        <div className="relative">
                            <input 
                                id="transfer-recipient"
                                name="recipient"
                                type="text" 
                                value={recipient}
                                onChange={(e) => setRecipient(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3.5 pl-10 text-white focus:border-blue-500 outline-none transition-all"
                                placeholder="Email, User ID, or Address"
                                required
                                autoComplete="off"
                            />
                            <User className="absolute left-3.5 top-3.5 text-gray-500" size={18} />
                        </div>
                        <p className="text-xs text-gray-500 ml-1">Instant internal transfers, zero fees for email/ID.</p>
                    </div>
                    
                    <div className="space-y-1">
                        <div className="flex justify-between ml-1">
                            <label htmlFor="transfer-amount" className="text-sm text-gray-400 font-medium">Amount</label>
                            <span className="text-xs text-gray-400">Available: {formatCurrency(availableBalance, selectedCurrency)}</span>
                        </div>
                        <div className="relative flex items-center">
                            <input 
                                id="transfer-amount"
                                name="amount"
                                type="number" 
                                step="any"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3.5 pl-10 text-white focus:border-blue-500 outline-none transition-all pr-[100px]"
                                placeholder="0.00"
                                required
                                autoComplete="off"
                            />
                            <WalletIcon className="absolute left-3.5 text-gray-500" size={18} />
                            <div className="absolute right-3 flex items-center gap-2">
                                <span className="text-gray-400 font-bold text-sm bg-gray-800">{selectedCurrency}</span>
                                <div className="h-4 w-px bg-gray-700"></div>
                                <button 
                                    type="button"
                                    onClick={handleMax}
                                    className="text-xs font-bold text-blue-500 hover:text-blue-400 bg-gray-800 px-1"
                                >
                                    MAX
                                </button>
                            </div>
                        </div>
                    </div>

                    <AnimatePresence>
                        {transferFee && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="bg-blue-900/10 border border-blue-500/20 p-4 rounded-xl text-sm space-y-2"
                            >
                                <div className="flex justify-between text-gray-400">
                                    <span>Digital Asset Access Fee</span>
                                    <span>{formatCurrency(transferFee.fee, selectedCurrency)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-white pt-2 border-t border-blue-500/20">
                                    <span>Total Deduction</span>
                                    <span>{formatCurrency(transferFee.net, selectedCurrency)}</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    {/* reCAPTCHA for Financial Security */}
                    <div className="flex justify-center p-2 bg-gray-800/30 rounded-xl border border-gray-800">
                        <ReCAPTCHA
                            ref={recaptchaRef}
                            sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'}
                            onChange={(token) => setCaptchaToken(token)}
                            theme="dark"
                        />
                    </div>

                    <div className="flex gap-3 justify-end mt-2">
                        <Button variant="ghost" onClick={onClose} type="button">
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSending}>
                            {isSending ? <Loader2 className="animate-spin mr-2" size={18} /> : <Send className="mr-2" size={18} />}
                            {isSending ? 'Sending...' : 'Confirm Transfer'}
                        </Button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};
