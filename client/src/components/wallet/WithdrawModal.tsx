import React, { useState, useEffect } from 'react';
import { X, ArrowUpRight, Loader2, Building2 } from 'lucide-react';
import { Button } from '../common/Button';
import { useWallet } from '../../hooks/useWallet';
import { formatCurrency } from '../../lib/CurrencyFormatter';
import type { Currency } from '@/types/wallet';
import { POPULAR_BANKS, COUNTRIES } from '../../lib/bankList';
import { motion, AnimatePresence } from 'framer-motion';

interface WithdrawModalProps {
    isOpen: boolean;
    onClose: () => void;
    selectedCurrency: Currency;
    onSuccess: () => void;
}

export const WithdrawModal: React.FC<WithdrawModalProps> = ({ isOpen, onClose, selectedCurrency, onSuccess }) => {
    const { withdraw, getCommissionRate, wallets } = useWallet();
    const [address, setAddress] = useState('');
    const [amount, setAmount] = useState('');
    const [isWithdrawing, setIsWithdrawing] = useState(false);
    const [withdrawFee, setWithdrawFee] = useState<{ fee: number, net: number } | null>(null);

    // Fiat State
    const [selectedCountry, setSelectedCountry] = useState('Nigeria'); // Default or detect
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedBank, setSelectedBank] = useState<{ name: string, code: string } | null>(null);
    const [accountNumber, setAccountNumber] = useState('');
    const [accountName, setAccountName] = useState('');
    const [showBankList, setShowBankList] = useState(false);

    const isFiat = selectedCurrency === 'USD' || selectedCurrency === 'NGN' || selectedCurrency === 'EUR' || selectedCurrency === 'GBP';

    const filteredBanks = POPULAR_BANKS.filter(b => 
        b.country === selectedCountry && 
        b.name.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const wallet = wallets.find(w => w.currency === selectedCurrency);
    const availableBalance = wallet ? (wallet.available_balance ?? wallet.balance) : 0;

    useEffect(() => {
        if (isOpen) {
            setAddress('');
            setAmount('');
            setAddress('');
            setAmount('');
            setWithdrawFee(null);
            setSelectedBank(null);
            setAccountNumber('');
            setAccountName('');
            setSearchTerm('');
        }
    }, [isOpen]);

    useEffect(() => {
        const calculateFee = async () => {
            if (!amount || isNaN(parseFloat(amount))) {
                setWithdrawFee(null);
                return;
            }
            const val = parseFloat(amount);
            const settings = await getCommissionRate('WITHDRAWAL', selectedCurrency);
            
            let fee = 0;
            if (settings && settings.length > 0) {
                const s = settings[0];
                if (s.commission_type === 'PERCENTAGE') fee = val * s.value;
                else fee = s.value;
                if (s.min_fee && fee < s.min_fee) fee = s.min_fee;
                if (s.max_fee && fee > s.max_fee) fee = s.max_fee;
            }
            setWithdrawFee({ fee, net: val - fee });
        };
        calculateFee();
    }, [amount, selectedCurrency, getCommissionRate]);

    const handleWithdraw = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (isFiat) {
             if (!amount || !selectedBank || !accountNumber || !accountName) return;
        } else {
             if (!amount || !address) return;
        }

        if (parseFloat(amount) > availableBalance) return;

        setIsWithdrawing(true);
        try {
            await withdraw({
                currency: selectedCurrency,
                amount: parseFloat(amount),
                address: isFiat ? undefined : address,
                bank_code: isFiat ? selectedBank?.code : undefined,
                bank_name: isFiat ? selectedBank?.name : undefined,
                account_number: isFiat ? accountNumber : undefined,
                account_name: isFiat ? accountName : undefined,
                country: isFiat ? selectedCountry : undefined
            });
            onSuccess();
            onClose();
        } catch (err) {
            // Error handled in context
        } finally {
            setIsWithdrawing(false);
        }
    };

    const handleMax = () => {
        setAmount(availableBalance.toString());
    };

    if (!isOpen) return null;


    // We already defined isFiat inside body, so remove or keep if scope allows. 
    // Usually cleaner to define top level. Done above.

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
                        <ArrowUpRight size={20} className="text-orange-500" />
                        Withdraw {selectedCurrency}
                    </h2>
                    <button onClick={onClose} className="p-1 hover:bg-gray-800 rounded-full transition-colors">
                        <X size={20} className="text-gray-400" />
                    </button>
                </div>
                
                <form onSubmit={handleWithdraw} className="flex flex-col gap-5">
                    {isFiat ? (
                        <div className="space-y-4">
                            {/* Country Selector */}
                            <div className="space-y-1">
                                <label className="text-xs text-gray-400 font-medium ml-1">Country</label>
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-800">
                                    {COUNTRIES.map(c => (
                                        <button
                                            key={c.code}
                                            type="button"
                                            onClick={() => {
                                                setSelectedCountry(c.name);
                                                setSelectedBank(null);
                                                setSearchTerm('');
                                            }}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap transition-colors ${
                                                selectedCountry === c.name 
                                                ? 'bg-orange-500/10 border-orange-500 text-orange-400' 
                                                : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'
                                            }`}
                                        >
                                            {c.name}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Bank Search & Select */}
                            <div className="space-y-1 relative">
                                <label className="text-xs text-gray-400 font-medium ml-1">Bank Name</label>
                                <div className="relative">
                                    <input 
                                        type="text" 
                                        value={searchTerm}
                                        onChange={(e) => {
                                            setSearchTerm(e.target.value);
                                            setShowBankList(true);
                                            if (selectedBank && e.target.value !== selectedBank.name) setSelectedBank(null);
                                        }}
                                        onFocus={() => setShowBankList(true)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3.5 pl-10 text-white focus:border-orange-500 outline-none transition-all"
                                        placeholder="Search bank..."
                                        autoComplete="off"
                                    />
                                    <Building2 className="absolute left-3.5 top-3.5 text-gray-500" size={18} />
                                    {selectedBank && (
                                        <button 
                                            type="button"
                                            onClick={() => {
                                                setSelectedBank(null);
                                                setSearchTerm('');
                                            }}
                                            className="absolute right-3 top-3.5 text-gray-500 hover:text-white"
                                        >
                                            <X size={16} />
                                        </button>
                                    )}
                                </div>
                                
                                {/* Dropdown */}
                                <AnimatePresence>
                                    {showBankList && searchTerm && !selectedBank && (
                                        <motion.div 
                                            initial={{ opacity: 0, y: -10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, y: -10 }}
                                            className="absolute left-0 right-0 top-full mt-1 bg-gray-900 border border-gray-700 rounded-xl shadow-xl max-h-48 overflow-y-auto z-20"
                                        >
                                            {filteredBanks.length > 0 ? (
                                                filteredBanks.map(bank => (
                                                    <button
                                                        key={bank.id}
                                                        type="button"
                                                        onClick={() => {
                                                            setSelectedBank({ name: bank.name, code: bank.code });
                                                            setSearchTerm(bank.name);
                                                            setShowBankList(false);
                                                        }}
                                                        className="w-full text-left p-3 hover:bg-gray-800 text-sm text-gray-300 border-b border-gray-800 last:border-0"
                                                    >
                                                        {bank.name}
                                                    </button>
                                                ))
                                            ) : (
                                                <div className="p-3 text-sm text-gray-500 text-center">No banks found</div>
                                            )}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-400 font-medium ml-1">Account Number</label>
                                    <input 
                                        type="text" 
                                        value={accountNumber}
                                        onChange={(e) => setAccountNumber(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3.5 text-white focus:border-orange-500 outline-none transition-all"
                                        placeholder={selectedCountry === 'Nigeria' ? "0123456789" : "IBAN / Account No"}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-gray-400 font-medium ml-1">Account Holder Name</label>
                                    <input 
                                        type="text" 
                                        value={accountName}
                                        onChange={(e) => setAccountName(e.target.value)}
                                        className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3.5 text-white focus:border-orange-500 outline-none transition-all"
                                        placeholder="Full Name"
                                    />
                                </div>
                            </div>
                        </div>
                    ) : (
                         <div className="space-y-1">
                            <label className="text-sm text-gray-400 font-medium ml-1">
                                Destination Address
                            </label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    value={address}
                                    onChange={(e) => setAddress(e.target.value)}
                                    className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3.5 pl-10 text-white focus:border-orange-500 outline-none transition-all"
                                    placeholder="Wallet Address (0x...)"
                                    required
                                    autoComplete="off"
                                />
                                <Building2 className="absolute left-3.5 top-3.5 text-gray-500" size={18} />
                            </div>
                        </div>
                    )}
                    
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
                                className="w-full bg-gray-800 border border-gray-700 rounded-xl p-3.5 text-white focus:border-orange-500 outline-none transition-all pr-16"
                                placeholder="0.00"
                                required
                                autoComplete="off"
                            />
                            <span className="absolute right-14 top-3.5 text-gray-400 font-bold">{selectedCurrency}</span>
                            <button 
                                type="button"
                                onClick={handleMax}
                                className="absolute right-3 top-3.5 text-xs font-bold text-orange-500 hover:text-orange-400"
                            >
                                MAX
                            </button>
                        </div>
                    </div>

                    <AnimatePresence>
                        {withdrawFee && (
                            <motion.div 
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="bg-orange-900/10 border border-orange-500/20 p-4 rounded-xl text-sm space-y-2"
                            >
                                <div className="flex justify-between text-gray-400">
                                    <span>Processing Fee</span>
                                    <span>{formatCurrency(withdrawFee.fee, selectedCurrency)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-white pt-2 border-t border-orange-500/20">
                                    <span>You Receive (Est.)</span>
                                    <span>{formatCurrency(withdrawFee.net, selectedCurrency)}</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <div className="flex gap-3 justify-end mt-2">
                        <Button variant="ghost" onClick={onClose} type="button">
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isWithdrawing} className="bg-orange-600 hover:bg-orange-500 text-white border-none">
                            {isWithdrawing ? <Loader2 className="animate-spin mr-2" size={18} /> : <ArrowUpRight className="mr-2" size={18} />}
                            {isWithdrawing ? 'Processing...' : 'Confirm Withdrawal'}
                        </Button>
                    </div>
                </form>
            </motion.div>
        </div>
    );
};
