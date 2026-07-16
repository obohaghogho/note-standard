import React, { useState, useEffect } from 'react';
import { Landmark, CheckCircle2, Loader2, Plus, X, Globe } from 'lucide-react';
import { Button } from '../common/Button';
import walletApi from '../../api/walletApi';
import toast from 'react-hot-toast';


interface BankAccount {
    currency: string;
    account_holder: string;
    account_number: string;
    iban_last4?: string;
    bank_name: string;
    payment_schemes: string[];
    settlement_info: string;
}

const SUPPORTED_BANKS = [
    { currency: 'USD', label: 'US (USD)' },
    { currency: 'GBP', label: 'UK (GBP)' },
    { currency: 'EUR', label: 'Europe (EUR)' }
];

export const BankAccountCard: React.FC = () => {
    const [selectedCurrency, setSelectedCurrency] = useState('USD');
    const [account, setAccount] = useState<BankAccount | null>(null);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [formData, setFormData] = useState({
        account_holder: '',
        account_number: '',
        iban: '',
        swift_code: '',
        sort_code: '',
        wire_routing: '',
        ach_routing: '',
        bank_name: '',
        bank_address: ''
    });

    const fetchAccount = async (currency: string, signal?: AbortSignal) => {
        try {
            setLoading(true);
            // Returns null when no account found (404), data otherwise
            const data = await walletApi.getBankAccount(currency, signal);
            if (signal?.aborted) return;
            setAccount(data);  // null = "Add your account" empty state
        } catch (err: unknown) {
            if (signal?.aborted) return;
            // Ignore AbortError / CanceledError — expected when switching tabs quickly
            const errName = (err as { name?: string })?.name;
            const errCode = (err as { code?: string })?.code;
            if (errName === 'AbortError' || errName === 'CanceledError' || errCode === 'ERR_CANCELED') return;

            // Only genuine server errors reach here
            console.error('Failed to fetch bank account:', err);
            toast.error(`Connection issue while loading ${currency} details. Please refresh.`);
            setAccount(null);
        } finally {
            if (!signal?.aborted) {
                setLoading(false);
            }
        }
    };

    useEffect(() => {
        const controller = new AbortController();
        fetchAccount(selectedCurrency, controller.signal);
        
        return () => {
            controller.abort();
        };
    }, [selectedCurrency]);

    const handleCurrencyChange = (curr: string) => {
        setSelectedCurrency(curr);
        setShowForm(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSubmitting(true);
            const payload = {
                ...formData,
                currency: selectedCurrency,
                // Add default schemes/fees based on currency for this demo
                payment_schemes: selectedCurrency === 'USD' ? ['ACH', 'WIRE'] : 
                                selectedCurrency === 'GBP' ? ['FPS', 'BACS', 'CHAPS'] : ['SEPA', 'SEPA_INSTANT'],
                geo_restriction: selectedCurrency === 'USD' ? 'US only' : 'EEA only'
            };
            const data = await walletApi.saveBankAccount(payload);
            setAccount(data);
            setShowForm(false);
            toast.success(`${selectedCurrency} Bank account linked!`);
        } catch (err) {
            const apiErr = err as ApiError;
            toast.error(apiErr.response?.data?.error || 'Failed to link bank account');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading) {
        return (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-6 flex items-center justify-center min-h-[200px]">
                <Loader2 className="animate-spin text-purple-500" size={24} />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* Currency Tabs */}
            <div className="flex gap-2 p-1 bg-black/40 border border-white/5 rounded-xl self-start w-fit">
                {SUPPORTED_BANKS.map(bank => (
                    <button
                        key={bank.currency}
                        onClick={() => handleCurrencyChange(bank.currency)}
                        className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            selectedCurrency === bank.currency 
                            ? 'bg-purple-600 text-white shadow-lg' 
                            : 'text-gray-500 hover:text-gray-300'
                        }`}
                    >
                        {bank.label}
                    </button>
                ))}
            </div>

            {showForm ? (
                <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-4">
                        <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-white">
                            <X size={20} />
                        </button>
                    </div>
                    <div className="flex items-center gap-3 mb-6">
                        <div className="p-2 bg-purple-500/10 rounded-lg">
                            <Landmark className="text-purple-400" size={20} />
                        </div>
                        <h3 className="text-lg font-bold">Link {selectedCurrency} Account</h3>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                                <label htmlFor="account_holder" className="text-[10px] font-bold text-gray-400 uppercase">Account Holder</label>
                                <input id="account_holder" name="account_holder" required value={formData.account_holder} onChange={e => setFormData({...formData, account_holder: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-purple-500/50 outline-none" />
                            </div>
                            <div className="space-y-1.5">
                                <label htmlFor="bank_name" className="text-[10px] font-bold text-gray-400 uppercase">Bank Name</label>
                                <input id="bank_name" name="bank_name" required value={formData.bank_name} onChange={e => setFormData({...formData, bank_name: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-purple-500/50 outline-none" />
                            </div>
                        </div>

                        <div className="space-y-1.5">
                            <label htmlFor="account_number" className="text-[10px] font-bold text-gray-400 uppercase">Account Number</label>
                            <input id="account_number" name="account_number" required type="password" value={formData.account_number} onChange={e => setFormData({...formData, account_number: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-purple-500/50 outline-none" />
                        </div>

                        {selectedCurrency !== 'USD' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label htmlFor="iban" className="text-[10px] font-bold text-gray-400 uppercase">IBAN</label>
                                    <input id="iban" name="iban" required value={formData.iban} onChange={e => setFormData({...formData, iban: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-purple-500/50 outline-none" />
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="swift_code" className="text-[10px] font-bold text-gray-400 uppercase">SWIFT / BIC</label>
                                    <input id="swift_code" name="swift_code" required value={formData.swift_code} onChange={e => setFormData({...formData, swift_code: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-purple-500/50 outline-none" />
                                </div>
                            </div>
                        )}

                        {selectedCurrency === 'GBP' && (
                            <div className="space-y-1.5">
                                <label htmlFor="sort_code" className="text-[10px] font-bold text-gray-400 uppercase">Sort Code</label>
                                <input id="sort_code" name="sort_code" required value={formData.sort_code} onChange={e => setFormData({...formData, sort_code: e.target.value})} placeholder="6 digits" className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-purple-500/50 outline-none" />
                            </div>
                        )}

                        {selectedCurrency === 'USD' && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label htmlFor="ach_routing" className="text-[10px] font-bold text-gray-400 uppercase">ACH Routing</label>
                                    <input id="ach_routing" name="ach_routing" required value={formData.ach_routing} onChange={e => setFormData({...formData, ach_routing: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-purple-500/50 outline-none" />
                                </div>
                                <div className="space-y-1.5">
                                    <label htmlFor="wire_routing" className="text-[10px] font-bold text-gray-400 uppercase">Wire Routing</label>
                                    <input id="wire_routing" name="wire_routing" required value={formData.wire_routing} onChange={e => setFormData({...formData, wire_routing: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-purple-500/50 outline-none" />
                                </div>
                            </div>
                        )}

                        <div className="space-y-1.5">
                            <label htmlFor="bank_address" className="text-[10px] font-bold text-gray-400 uppercase">Bank Address</label>
                            <input id="bank_address" name="bank_address" required value={formData.bank_address} onChange={e => setFormData({...formData, bank_address: e.target.value})} className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm focus:border-purple-500/50 outline-none" />
                        </div>

                        <Button type="submit" disabled={submitting} className="w-full bg-purple-600 hover:bg-purple-500 h-11">
                            {submitting ? <Loader2 className="animate-spin" size={18} /> : `Link ${selectedCurrency} Account`}
                        </Button>
                    </form>
                </div>
            ) : account ? (
                <div className="bg-gradient-to-br from-gray-900 to-black border border-white/10 rounded-2xl p-6 shadow-2xl relative overflow-hidden group">
                    <div className="absolute -top-12 -right-12 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl" />
                    
                    <div className="flex justify-between items-start mb-8 relative">
                        <div className="flex items-center gap-3">
                            <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                                <Landmark className="text-purple-400" size={24} />
                            </div>
                            <div>
                                <h3 className="text-lg font-black tracking-tight">{account.bank_name}</h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-purple-400 font-bold uppercase tracking-widest">{account.currency} • Checking</span>
                                    <div className="w-1 h-1 rounded-full bg-gray-700" />
                                    <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{account.payment_schemes?.join(', ')}</span>
                                </div>
                            </div>
                        </div>
                        <div className="bg-green-500/10 border border-green-500/20 px-3 py-1 rounded-full flex items-center gap-1.5">
                            <CheckCircle2 size={12} className="text-green-400" />
                            <span className="text-[10px] font-black text-green-400 uppercase tracking-wider">Active</span>
                        </div>
                    </div>

                    <div className="space-y-6 relative">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Account Number</label>
                                <div className="text-lg font-mono text-white/90">{account.account_number}</div>
                            </div>
                            {account.iban_last4 && (
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">IBAN</label>
                                    <div className="text-lg font-mono text-white/90">****{account.iban_last4}</div>
                                </div>
                            )}
                        </div>

                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1 block">Account Holder</label>
                            <p className="text-sm font-bold text-gray-200">{account.account_holder}</p>
                        </div>
                    </div>

                    <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-2 text-gray-500">
                             <Globe size={12} />
                             <span className="text-[10px] font-bold uppercase tracking-widest italic">{account.settlement_info}</span>
                        </div>
                        <button onClick={() => setShowForm(true)} className="text-[10px] font-black text-purple-400 hover:text-purple-300 uppercase tracking-widest">
                            Update Details
                        </button>
                    </div>
                </div>
            ) : (
                <div className="bg-white/5 border border-white/5 border-dashed rounded-2xl p-10 flex flex-col items-center text-center cursor-pointer hover:bg-white/[0.07] transition-all" onClick={() => setShowForm(true)}>
                    <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mb-4">
                        <Plus className="text-gray-500" size={24} />
                    </div>
                    <h3 className="text-sm font-bold mb-1">{selectedCurrency} Banking Details</h3>
                    <p className="text-xs text-gray-500 max-w-[200px]">Add your account details to unlock localized settlements.</p>
                </div>
            )}
        </div>
    );
};
