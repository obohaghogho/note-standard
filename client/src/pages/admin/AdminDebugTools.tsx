import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { API_URL } from '../../lib/api';
import { 
    Bug, 
    RefreshCw, 
    CheckCircle2, 
    Zap, 
    Globe, 
    AlertTriangle,
    Terminal,
    Play,
    Loader2,
    ShieldAlert
} from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Card } from '../../components/common/Card';
import toast from 'react-hot-toast';
import { cn } from '../../utils/cn';

export const AdminDebugTools: React.FC = () => {
    const { session } = useAuth();
    const [isTestingMode, setIsTestingMode] = useState(() => {
        return localStorage.getItem('admin_testing_mode') === 'true';
    });

    const [loading, setLoading] = useState<string | null>(null);

    // Force Confirm
    const [forceConfirmId, setForceConfirmId] = useState('');

    // Simulate Swap
    const [swapData, setSwapData] = useState({
        walletId: '',
        fromCurrency: 'USD',
        toCurrency: 'BTC',
        amount: 100,
        rate: 0.000015,
        fee: 1
    });

    // Simulate Webhook
    const [webhookData, setWebhookData] = useState({
        provider: 'PAYSTACK',
        reference: '',
        status: 'success'
    });

    const toggleTestingMode = () => {
        const newState = !isTestingMode;
        setIsTestingMode(newState);
        localStorage.setItem('admin_testing_mode', String(newState));
        toast.success(`Testing Mode ${newState ? 'Enabled' : 'Disabled'}`);
    };

    const handleAction = async (action: string, endpoint: string, body: any) => {
        if (!isTestingMode) {
            toast.error('Testing Mode must be enabled first');
            return;
        }

        setLoading(action);
        try {
            const res = await fetch(`${API_URL}/api/admin/debug/${endpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token}`
                },
                body: JSON.stringify(body)
            });

            const data = await res.json();
            if (res.ok) {
                toast.success(`${action} successful!`);
                console.log(`${action} response:`, data);
            } else {
                toast.error(data.error || `${action} failed`);
            }
        } catch (err) {
            toast.error(`Network error during ${action}`);
        } finally {
            setLoading(null);
        }
    };

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-black tracking-tight text-white flex items-center gap-3">
                        <Bug className="text-rose-500" size={32} />
                        Debug & Testing Tools
                    </h1>
                    <p className="text-gray-400 mt-1">Simulate backend events and override system constraints.</p>
                </div>

                <button 
                    onClick={toggleTestingMode}
                    className={cn(
                        "relative inline-flex h-12 w-48 items-center justify-center rounded-xl font-bold transition-all overflow-hidden group",
                        isTestingMode ? "bg-rose-500 text-white shadow-[0_0_20px_rgba(244,63,94,0.3)]" : "bg-white/5 text-gray-400 border border-white/10"
                    )}
                >
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                    <span className="relative flex items-center gap-2">
                        {isTestingMode ? <ShieldAlert size={18} /> : <Bug size={18} />}
                        {isTestingMode ? 'TESTING MODE ON' : 'ENABLE TESTING'}
                    </span>
                </button>
            </div>

            <div className={cn(
                "grid grid-cols-1 md:grid-cols-2 gap-6 transition-all duration-500",
                !isTestingMode && "opacity-40 grayscale pointer-events-none scale-[0.98]"
            )}>
                
                {/* Force Confirm Transaction */}
                <Card variant="glass" className="p-6 border-rose-500/20">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center">
                            <CheckCircle2 size={20} />
                        </div>
                        <h3 className="text-lg font-bold">Force Confirm Transaction</h3>
                    </div>
                    <div className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Transaction ID / Reference</label>
                            <input 
                                type="text"
                                value={forceConfirmId}
                                onChange={(e) => setForceConfirmId(e.target.value)}
                                placeholder="e.g. txn_123456..."
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-rose-500/50"
                            />
                        </div>
                        <Button 
                            className="w-full bg-rose-500 hover:bg-rose-600 text-white py-3"
                            disabled={loading === 'confirm'}
                            onClick={() => handleAction('confirm', 'force-confirm', { transactionId: forceConfirmId })}
                        >
                            {loading === 'confirm' ? <Loader2 className="animate-spin" size={18} /> : <Zap size={18} />}
                            Force Confirm
                        </Button>
                    </div>
                </Card>

                {/* Simulate Swap */}
                <Card variant="glass" className="p-6 border-purple-500/20">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-full bg-purple-500/20 text-purple-500 flex items-center justify-center">
                            <RefreshCw size={20} />
                        </div>
                        <h3 className="text-lg font-bold">Simulate Swap</h3>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Wallet ID</label>
                            <input 
                                type="text"
                                value={swapData.walletId}
                                onChange={(e) => setSwapData({...swapData, walletId: e.target.value})}
                                placeholder="Target Wallet UUID"
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-purple-500/50"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">From</label>
                            <input 
                                type="text"
                                value={swapData.fromCurrency}
                                onChange={(e) => setSwapData({...swapData, fromCurrency: e.target.value})}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">To</label>
                            <input 
                                type="text"
                                value={swapData.toCurrency}
                                onChange={(e) => setSwapData({...swapData, toCurrency: e.target.value})}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none"
                            />
                        </div>
                        <div className="col-span-2">
                             <Button 
                                className="w-full bg-purple-500 hover:bg-purple-600 text-white py-3"
                                disabled={loading === 'swap'}
                                onClick={() => handleAction('swap', 'simulate-swap', swapData)}
                            >
                                {loading === 'swap' ? <Loader2 className="animate-spin" size={18} /> : <RefreshCw size={18} />}
                                Execute Test Swap
                            </Button>
                        </div>
                    </div>
                </Card>

                {/* Simulate Webhook */}
                <Card variant="glass" className="p-6 border-blue-500/20 md:col-span-2">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center">
                            <Globe size={20} />
                        </div>
                        <h3 className="text-lg font-bold">Simulate Webhook Success</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Provider</label>
                            <select 
                                value={webhookData.provider}
                                onChange={(e) => setWebhookData({...webhookData, provider: e.target.value})}
                                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none"
                            >
                                <option value="PAYSTACK" className="bg-black">Paystack</option>
                                <option value="FLUTTERWAVE" className="bg-black">Flutterwave</option>
                                <option value="KORAPAY" className="bg-black">Korapay</option>
                                <option value="NOWPAYMENTS" className="bg-black">NOWPayments</option>
                            </select>
                        </div>
                        <div className="md:col-span-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-1.5 block">Reference ID</label>
                            <div className="flex gap-2">
                                <input 
                                    type="text"
                                    value={webhookData.reference}
                                    onChange={(e) => setWebhookData({...webhookData, reference: e.target.value})}
                                    placeholder="Provider Ref or Order ID"
                                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-500/50"
                                />
                                <Button 
                                    className="bg-blue-500 hover:bg-blue-600 text-white min-w-[150px]"
                                    disabled={loading === 'webhook'}
                                    onClick={() => handleAction('webhook', 'simulate-webhook', webhookData)}
                                >
                                    {loading === 'webhook' ? <Loader2 className="animate-spin" size={18} /> : <Play size={18} />}
                                    Simulate
                                </Button>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>

            {!isTestingMode && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 flex flex-col md:flex-row items-center gap-6 text-center md:text-left">
                    <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-500 flex items-center justify-center shrink-0">
                        <AlertTriangle size={24} />
                    </div>
                    <div>
                        <h4 className="text-amber-500 font-bold">Testing Mode Locked</h4>
                        <p className="text-sm text-gray-400 mt-1">Enable testing mode to bypass security checks and simulate backend events. Use with caution in production.</p>
                    </div>
                </div>
            )}

            <Card variant="glass" className="bg-black/40 border-white/5 p-6">
                <div className="flex items-center gap-2 mb-4 text-xs font-bold text-gray-500 uppercase tracking-widest">
                    <Terminal size={14} /> Output Console
                </div>
                <div className="font-mono text-[11px] text-green-400/80 p-4 bg-black rounded-xl border border-white/5 min-h-[100px] max-h-[200px] overflow-y-auto">
                    {loading ? `> Executing ${loading}...` : '> System ready. Waiting for debug commands...'}
                    <br />
                    {isTestingMode && '> Testing Mode: ACTIVE'}
                </div>
            </Card>
        </div>
    );
};
