import React, { useState, useEffect } from 'react';
import { X, Send, Loader2, User, Wallet as WalletIcon } from 'lucide-react';
import { Button } from '../common/Button';
import { useWallet } from '../../hooks/useWallet';
import { formatCurrency } from '../../lib/CurrencyFormatter';
import type { Currency } from '@/types/wallet';
import { motion, AnimatePresence } from 'framer-motion';

interface TransferModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedCurrency: Currency;
    onSuccess: () => void;
}

export const TransferModal: React.FC<TransferModalProps> = ({ isOpen, onClose, selectedCurrency, onSuccess }) => {
    const { sendFunds, getCommissionRate, wallets } = useWallet();
    const [recipient, setRecipient] = useState('');
    const [amount, setAmount] = useState('');
    const [isSending, setIsSending] = useState(false);
    const [transferFee, setTransferFee] = useState<{ fee: number, net: number } | null>(null);

    const wallet = wallets.find(w => w.currency === selectedCurrency);
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
            const isAddress = !isEmail && (recipient.startsWith('0x') || recipient.startsWith('bc1') || recipient.length > 20);
            
            const type = isAddress ? 'WITHDRAWAL' : 'TRANSFER_OUT';
            const settings = await getCommissionRate(type, selectedCurrency);
            
            let fee = 0;
            if (settings && settings.length > 0) {
                const s = settings[0];
                if (s.commission_type === 'PERCENTAGE') fee = val * s.value;
                else fee = s.value;
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

        setIsSending(true);
        try {
            const isEmail = recipient.includes('@');
            const isAddress = !isEmail && (recipient.startsWith('0x') || recipient.startsWith('bc1') || recipient.length > 20);

            await sendFunds({
                currency: selectedCurrency,
                amount: parseFloat(amount),
                recipientEmail: isEmail ? recipient : undefined,
                recipientAddress: isAddress ? recipient : undefined,
                recipientId: (!isEmail && !isAddress) ? recipient : undefined,
            });
            onSuccess();
            onClose();
        } catch (err) {
            // Error handled in context or toast
        } finally {
            setIsSending(false);
        }
    };

    const handleMax = () => {
        setAmount(availableBalance.toString());
    };

    if (!isOpen) return null;

    return (
        <div className="modal-overlay">
            <motion.div 
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="modal-content"
                style={{ maxWidth: '480px' }}
            >
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Send size={20} className="text-blue-500" />
                        Send {selectedCurrency}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded-full transition-colors">
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>
                
                <form onSubmit={handleSend} className="flex flex-col gap-5">
                    <div className="space-y-1">
                        <label className="text-sm text-gray-400 font-medium ml-1">Recipient</label>
                        <div className="relative">
                            <input 
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
                            <label className="text-sm text-gray-400 font-medium">Amount</label>
                            <span className="text-xs text-gray-400">Available: {formatCurrency(availableBalance, selectedCurrency)}</span>
                        </div>
                        <div className="relative">
                            <input 
                                type="number" 
                                step="any"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3.5 pl-10 text-white focus:border-blue-500 outline-none transition-all pr-16"
                                placeholder="0.00"
                                required
                                autoComplete="off"
                            />
                            <WalletIcon className="absolute left-3.5 top-3.5 text-gray-500" size={18} />
                            <button 
                                type="button"
                                onClick={handleMax}
                                className="absolute right-3 top-3.5 text-xs font-bold text-blue-500 hover:text-blue-400"
                            >
                                MAX
                            </button>
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
                                    <span>Network Fee (Est.)</span>
                                    <span>{formatCurrency(transferFee.fee, selectedCurrency)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-white pt-2 border-t border-blue-500/20">
                                    <span>Total Deduction</span>
                                    <span>{formatCurrency(transferFee.net, selectedCurrency)}</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

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
