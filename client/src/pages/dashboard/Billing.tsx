import { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '../../lib/api';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Check, Loader2, Zap, X, Calendar, BadgeCheck, FileText, BarChart3, ShieldCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { supabaseSafe } from '../../lib/supabaseSafe';
import { useAuth } from '../../context/AuthContext';
import { useWallet } from '../../hooks/useWallet';
import { formatCurrency, detectLocalCurrency } from '../../lib/CurrencyFormatter';
import { walletApi } from '../../api/walletApi';

interface BillingRecord {
    id: string;
    reference: string;
    provider: string;
    amount: number;
    currency: string;
    status: string;
    created_at: string;
    completed_at: string | null;
    transactionId: string | null;
    metadata?: Record<string, any>;
}

export const Billing = () => {
    const { isPro, isBusiness, subscription, refreshProfile, user } = useAuth();
    const { wallets, refresh: refreshWallets } = useWallet();
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [currency, setCurrency] = useState<string>(detectLocalCurrency());
    const [exchangeRate, setExchangeRate] = useState<number | null>(null);
    const [notesCount, setNotesCount] = useState<number>(0);
    const [teamMembersCount, setTeamMembersCount] = useState<number>(0);
    const [billingHistory, setBillingHistory] = useState<BillingRecord[]>([]);
    const [historyLoading, setHistoryLoading] = useState(true);

    const fetchingRef = useRef(false);
    const isMounted = useRef(true);

    const getPrimaryWallet = () => {
        if (!wallets || wallets.length === 0) return null;
        // Prefer USD or NGN, or return the first available wallet
        const preferred = wallets.find(w => w.asset === 'USD') || wallets.find(w => w.asset === 'NGN') || wallets[0];
        return preferred;
    };

    const primaryWallet = getPrimaryWallet();

    const fetchUsageStats = useCallback(async () => {
        if (!user) return;
        try {
            // 1. Fetch Notes Count
            const { count: nCount, error: nError } = await supabase
                .from('notes')
                .select('id', { count: 'exact', head: true })
                .eq('owner_id', user.id);
            
            if (!nError && nCount !== null && isMounted.current) {
                setNotesCount(nCount);
            }

            // 2. Fetch Team Members Count (Referred to their teams)
            const { data: teams, error: teamsError } = await supabase
                .from('teams')
                .select('id')
                .eq('owner_id', user.id);
                
            if (!teamsError && teams && teams.length > 0) {
                const teamIds = teams.map(t => t.id);
                const { count: tCount, error: tCountError } = await supabase
                    .from('team_members')
                    .select('id', { count: 'exact', head: true })
                    .in('team_id', teamIds);
                if (!tCountError && tCount !== null && isMounted.current) {
                    setTeamMembersCount(tCount);
                }
            }
        } catch (err) {
            console.error('Failed to fetch usage statistics:', err);
        }
    }, [user]);

    const fetchBillingHistory = useCallback(async () => {
        if (!user) return;
        setHistoryLoading(true);
        try {
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (!token) return;

            const response = await fetch(`${API_URL}/api/subscription/billing-history`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            const dataRes = await response.json();
            if (dataRes.history && isMounted.current) {
                setBillingHistory(dataRes.history);
            }
        } catch (err) {
            console.error('Failed to fetch billing history:', err);
        } finally {
            if (isMounted.current) setHistoryLoading(false);
        }
    }, [user]);

    const syncSubscription = useCallback(async (reference: string) => {
        setProcessing(true);
        try {
            const { data } = await supabase.auth.getSession();
            const resolvedToken = data.session?.access_token;

            const response = await fetch(`${API_URL}/api/subscription/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${resolvedToken}`
                },
                body: JSON.stringify({ reference })
            });

            const dataRes = await response.json();
            if (dataRes.success) {
                toast.success('Subscription successfully synced!');
                refreshProfile(); // Refresh global auth state
                fetchBillingHistory();
            } else {
                toast.error('Verification failed or is still processing.');
            }
        } catch (error) {
            console.error('Sync error:', error);
            toast.error('Failed to verify subscription');
        } finally {
            window.history.replaceState({}, '', '/dashboard/billing');
            setProcessing(false);
        }
    }, [refreshProfile, fetchBillingHistory]);

    useEffect(() => {
        isMounted.current = true;
        checkSubscriptionStatus();
        fetchUsageStats();
        fetchBillingHistory();

        // Handle redirect from Paystack
        const reference = searchParams.get('reference');
        if (reference) {
            syncSubscription(reference);
        }
        
        return () => { isMounted.current = false; };
    }, [searchParams, syncSubscription, fetchUsageStats, fetchBillingHistory]);

    const checkSubscriptionStatus = async () => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;

        await supabaseSafe('billing-status', async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token;
            if (!token) return; 

            // Fetch Exchange Rate
            try {
                const rateResponse = await fetch(`${API_URL}/api/subscription/rate`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const rateData = await rateResponse.json();
                if (rateData.rate && isMounted.current) {
                    setExchangeRate(rateData.rate);
                }
            } catch (err) {
                console.error('Failed to fetch exchange rate', err);
            }
            
            return { success: true };
        });
        
        if (isMounted.current) {
            setLoading(false);
            fetchingRef.current = false;
        }
    };

    const handleUpgrade = async (planType: string = 'PRO') => {
        setProcessing(true);
        try {
            const { data } = await supabase.auth.getSession();
            const resolvedToken = data.session?.access_token;

            const response = await fetch(`${API_URL}/api/subscription/create-checkout-session`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${resolvedToken}`
                },
                body: JSON.stringify({ 
                    planType, 
                    paymentMethod: 'paystack',
                    currency 
                })
            });

            const dataRes = await response.json();
            if (dataRes.url) {
                console.log('Redirecting to checkout:', dataRes.url);
                window.location.href = dataRes.url;
            } else {
                throw new Error('No checkout URL received');
            }
        } catch (error) {
            console.error('Upgrade error:', error);
            toast.error('Failed to start checkout');
            setProcessing(false);
        }
    };

    const handleCancel = async () => {
        setProcessing(true);
        try {
            const { data } = await supabase.auth.getSession();
            const resolvedToken = data.session?.access_token;

            const response = await fetch(`${API_URL}/api/subscription/cancel`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resolvedToken}`
                }
            });

            const dataRes = await response.json();
            if (dataRes.success) {
                toast.success('Subscription canceled successfully');
                refreshProfile(); // Refresh global auth state
                fetchBillingHistory();
                setShowCancelModal(false);
            } else {
                toast.error('Failed to cancel subscription');
            }
        } catch (error) {
            console.error('Cancel error:', error);
            toast.error('Failed to cancel subscription');
        } finally {
            setProcessing(false);
        }
    };

    const getPlanPriceDisplay = (baseUsd: number) => {
        if (currency === 'USD') return formatCurrency(baseUsd, 'USD');
        if (exchangeRate) {
            return formatCurrency(baseUsd * exchangeRate, currency);
        }
        return formatCurrency(baseUsd, 'USD') + ` (Approx. in ${currency})`;
    };

    if (loading && !processing) {
        return (
            <div className="space-y-6 max-w-6xl mx-auto px-4 py-8">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 w-48 bg-white/5 rounded-lg" />
                    <div className="h-4 w-96 bg-white/5 rounded-lg" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6">
                        <div className="h-32 bg-white/5 rounded-3xl" />
                        <div className="h-32 bg-white/5 rounded-3xl" />
                        <div className="h-32 bg-white/5 rounded-3xl" />
                    </div>
                    <div className="h-64 bg-white/5 rounded-3xl mt-8" />
                </div>
            </div>
        );
    }

    // Calc limit metrics
    const maxNotesLimit = isBusiness ? Infinity : (isPro ? Infinity : 100);
    const notesPercent = maxNotesLimit === Infinity ? 0 : Math.min(100, (notesCount / maxNotesLimit) * 100);
    const storageLimitMb = isBusiness ? 5000 : (isPro ? 1000 : 10);
    const estimatedStorageMb = parseFloat((notesCount * 0.002).toFixed(2));
    const storagePercent = Math.min(100, (estimatedStorageMb / storageLimitMb) * 100);
    const teamLimit = isBusiness ? Infinity : 0;
    const teamPercent = teamLimit === Infinity ? 0 : (teamMembersCount > 0 ? 100 : 0);

    return (
        <div className="space-y-8 max-w-6xl mx-auto px-4 py-8 text-white min-h-screen">
            {/* Top Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                    <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-white via-gray-300 to-gray-500 bg-clip-text text-transparent">Plan & Billing</h1>
                    <p className="text-gray-400 font-light">Manage your subscription, workspace usage limits, and invoices.</p>
                </div>

                <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-2xl p-1 self-start md:self-auto">
                    {['USD', 'EUR', 'GBP', 'NGN'].map(cur => (
                        <button
                            key={cur}
                            onClick={() => setCurrency(cur)}
                            className={`px-4 py-1.5 rounded-xl text-xs font-semibold tracking-wide transition-all duration-300 ${currency === cur ? 'bg-white text-black shadow-lg shadow-black/25' : 'text-gray-400 hover:text-white'}`}
                        >
                            {cur}
                        </button>
                    ))}
                </div>
            </div>

            {processing && (
                <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 p-4 rounded-2xl flex items-center gap-3 animate-pulse">
                    <Loader2 className="animate-spin shrink-0" size={20} />
                    <p className="text-sm font-medium">Processing your transaction safely. Please do not close or reload the page...</p>
                </div>
            )}

            {/* Overview grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card variant="glass" className="p-6 border-white/5 flex flex-col justify-between h-44 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-xl group-hover:bg-purple-500/10 transition-colors" />
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Active Tier</span>
                        <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-black capitalize">{subscription?.plan_tier || 'Free Tier'}</h2>
                            {subscription?.status === 'active' && <BadgeCheck className="text-blue-400" size={20} />}
                        </div>
                        {subscription?.end_date && (
                            <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
                                <Calendar size={12} /> Renews {new Date(subscription.end_date).toLocaleDateString()}
                            </p>
                        )}
                    </div>
                    {subscription?.status === 'active' && subscription.plan_tier !== 'free' ? (
                        <button
                            onClick={() => setShowCancelModal(true)}
                            className="text-xs font-semibold text-rose-400 hover:text-rose-300 transition-colors self-start border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 px-3 py-1.5 rounded-xl mt-4"
                        >
                            Cancel Plan
                        </button>
                    ) : (
                        <p className="text-xs text-gray-500 italic mt-4">Basic core functions active</p>
                    )}
                </Card>

                <Card variant="glass" className="p-6 border-white/5 flex flex-col justify-between h-44 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-green-500/5 rounded-full blur-xl group-hover:bg-green-500/10 transition-colors" />
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Resource Capacity</span>
                        <h2 className="text-2xl font-black">{notesCount} <span className="text-sm font-normal text-gray-400">/ {maxNotesLimit === Infinity ? 'Unlimited' : maxNotesLimit} notes</span></h2>
                        <div className="w-full bg-white/5 rounded-full h-1.5 mt-3 overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all duration-1000 ${notesPercent > 80 ? 'bg-rose-500' : (notesPercent > 50 ? 'bg-yellow-500' : 'bg-emerald-500')}`} 
                                style={{ width: `${maxNotesLimit === Infinity ? 10 : notesPercent}%` }} 
                            />
                        </div>
                    </div>
                    <p className="text-xs text-gray-400 flex items-center gap-1 mt-4">
                        <BarChart3 size={12} /> {notesPercent.toFixed(0)}% of notes capacity used
                    </p>
                </Card>

                <Card variant="glass" className="p-6 border-white/5 flex flex-col justify-between h-44 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl group-hover:bg-blue-500/10 transition-colors" />
                    <div>
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-widest block mb-1">Custodial Wallet Balance</span>
                        <h2 className="text-2xl font-black">
                            {primaryWallet ? formatCurrency(primaryWallet.balance, primaryWallet.asset) : formatCurrency(0, 'USD')}
                        </h2>
                        <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider">
                            Active Asset: {primaryWallet?.asset || 'None'}
                        </p>
                    </div>
                    <button
                        onClick={refreshWallets}
                        className="text-xs font-semibold text-blue-400 hover:text-blue-300 transition-colors self-start border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 px-3 py-1.5 rounded-xl mt-4"
                    >
                        Sync Wallet Balance
                    </button>
                </Card>
            </div>

            {/* Detailed Usage progress bars */}
            <Card variant="glass" className="p-6 border-white/5 space-y-6">
                <div className="flex items-center justify-between border-b border-white/5 pb-4">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                        <BarChart3 size={18} className="text-purple-400" /> Usage statistics & quotas
                    </h3>
                    <span className="text-xs text-gray-400 font-light">Resets monthly on billing anniversary</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {/* Notes count usage */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-300 font-medium">Notes created</span>
                            <span className="text-xs font-mono font-bold text-gray-400">{notesCount} / {maxNotesLimit === Infinity ? 'Unlimited' : maxNotesLimit}</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all duration-1000 ${notesPercent > 80 ? 'bg-rose-500' : (notesPercent > 50 ? 'bg-yellow-500' : 'bg-purple-500')}`} 
                                style={{ width: `${maxNotesLimit === Infinity ? 0 : notesPercent}%` }} 
                            />
                        </div>
                        <p className="text-[10px] text-gray-500">Required for keeping daily activity summaries.</p>
                    </div>

                    {/* Storage usage estimation */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-300 font-medium">Text Storage</span>
                            <span className="text-xs font-mono font-bold text-gray-400">{estimatedStorageMb} MB / {storageLimitMb} MB</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all duration-1000 ${storagePercent > 80 ? 'bg-rose-500' : (storagePercent > 50 ? 'bg-yellow-500' : 'bg-blue-500')}`} 
                                style={{ width: `${storagePercent}%` }} 
                            />
                        </div>
                        <p className="text-[10px] text-gray-500">Calculated from raw note text and attachments.</p>
                    </div>

                    {/* Team Members */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-gray-300 font-medium">Team members limit</span>
                            <span className="text-xs font-mono font-bold text-gray-400">{teamMembersCount} / {teamLimit === Infinity ? 'Unlimited' : teamLimit}</span>
                        </div>
                        <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden">
                            <div 
                                className={`h-full rounded-full transition-all duration-1000 bg-emerald-500`} 
                                style={{ width: `${teamPercent}%` }} 
                            />
                        </div>
                        <p className="text-[10px] text-gray-500">Requires a Business subscription plan for collaboration.</p>
                    </div>
                </div>
            </Card>

            {/* Redesigned pricing cards */}
            <div className="space-y-6">
                <div className="text-center space-y-2">
                    <h3 className="text-2xl font-black">Choose the perfect plan for you</h3>
                    <p className="text-gray-400 text-sm max-w-lg mx-auto font-light">Elevate your workspace with advanced features, prioritized processing, and professional-grade security.</p>
                </div>

                <div className="grid md:grid-cols-3 gap-6 pt-4">
                    {/* Free Plan */}
                    <Card className={`p-8 border-2 ${subscription?.plan_tier === 'free' || !isPro ? 'border-purple-500 bg-purple-500/5' : 'border-white/5'} transition-all duration-500 relative flex flex-col justify-between group`}>
                        {(!isPro && subscription?.plan_tier !== 'business') && (
                            <div className="absolute top-0 right-0 bg-purple-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-xl shadow-lg">
                                Current Plan
                            </div>
                        )}
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-xl font-bold">Free Plan</h4>
                                <p className="text-xs text-gray-400 mt-1 font-light">Great for personal journaling.</p>
                            </div>
                            <div className="flex items-baseline">
                                <span className="text-4xl font-black">$0</span>
                                <span className="text-gray-400 text-sm ml-2">/ month</span>
                            </div>
                            <ul className="space-y-3 pt-4 border-t border-white/5 text-sm font-light text-gray-300">
                                <li className="flex items-center gap-2.5">
                                    <Check size={16} className="text-purple-400" /> 100 Notes Capacity
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <Check size={16} className="text-purple-400" /> 1.0% Crypto Spread
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <Check size={16} className="text-purple-400" /> Standard System Fees
                                </li>
                                <li className="flex items-center gap-2.5 text-gray-500">
                                    <X size={16} className="shrink-0" /> Priority Support (AI-only)
                                </li>
                            </ul>
                        </div>
                        <div className="pt-8">
                            <Button
                                variant="secondary"
                                fullWidth
                                disabled={!isPro}
                                className={!isPro ? "opacity-50 cursor-default border-white/10" : "border-white/10 hover:bg-white/5"}
                            >
                                {!isPro ? 'Current Plan' : 'Downgrade'}
                            </Button>
                        </div>
                    </Card>

                    {/* Pro Plan */}
                    <Card className={`p-8 border-2 ${subscription?.plan_tier === 'pro' ? 'border-purple-500 bg-purple-500/5' : 'border-white/5'} transition-all duration-500 relative flex flex-col justify-between group`}>
                        {subscription?.plan_tier === 'pro' && (
                            <div className="absolute top-0 right-0 bg-purple-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-xl shadow-lg">
                                Active Plan
                            </div>
                        )}
                        <div className="space-y-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-xl font-bold flex items-center gap-2">
                                        Pro Plan <Zap size={16} className="text-yellow-400 fill-yellow-400" />
                                    </h4>
                                    <p className="text-xs text-gray-400 mt-1 font-light">Unlock professional productivity.</p>
                                </div>
                                <span className="bg-purple-500/20 text-purple-400 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Popular</span>
                            </div>
                            <div className="flex items-baseline">
                                <span className="text-4xl font-black">{getPlanPriceDisplay(9.99)}</span>
                                <span className="text-gray-400 text-sm ml-2">/ month</span>
                            </div>
                            {currency === 'NGN' && exchangeRate && (
                                <p className="text-xs text-gray-500 italic mt-[-15px]">Approx. NGN {(9.99 * exchangeRate).toLocaleString()}</p>
                            )}
                            <ul className="space-y-3 pt-4 border-t border-white/5 text-sm font-light text-gray-300">
                                <li className="flex items-center gap-2.5">
                                    <Check size={16} className="text-purple-400" /> Unlimited Notes Capacity
                                </li>
                                <li className="flex items-center gap-2.5 font-bold text-white">
                                    <Check size={16} className="text-purple-400" /> 0.5% Crypto Spread
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <Check size={16} className="text-purple-400" /> 20% Discount on Fees
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <Check size={16} className="text-purple-400" /> Priority Support (AI + Human)
                                </li>
                            </ul>
                        </div>
                        <div className="pt-8">
                            {subscription?.plan_tier === 'pro' ? (
                                <Button variant="secondary" fullWidth className="border-white/10 cursor-default opacity-50">
                                    Active Plan
                                </Button>
                            ) : (
                                <Button
                                    onClick={() => handleUpgrade('PRO')}
                                    disabled={processing}
                                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 border-none text-white shadow-lg shadow-purple-900/20"
                                >
                                    {processing ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Upgrade to Pro'}
                                </Button>
                            )}
                        </div>
                    </Card>

                    {/* Business Plan */}
                    <Card className={`p-8 border-2 ${subscription?.plan_tier === 'business' ? 'border-purple-500 bg-purple-500/5' : 'border-white/5'} transition-all duration-500 relative flex flex-col justify-between group`}>
                        {subscription?.plan_tier === 'business' && (
                            <div className="absolute top-0 right-0 bg-purple-500 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1 rounded-bl-xl shadow-lg">
                                Active Plan
                            </div>
                        )}
                        <div className="space-y-6">
                            <div>
                                <h4 className="text-xl font-bold flex items-center gap-2">
                                    Business Plan <BadgeCheck size={18} className="text-blue-400" />
                                </h4>
                                <p className="text-xs text-gray-400 mt-1 font-light">Collaborate at scale.</p>
                            </div>
                            <div className="flex items-baseline">
                                <span className="text-4xl font-black">{getPlanPriceDisplay(29.99)}</span>
                                <span className="text-gray-400 text-sm ml-2">/ month</span>
                            </div>
                            {currency === 'NGN' && exchangeRate && (
                                <p className="text-xs text-gray-500 italic mt-[-15px]">Approx. NGN {(29.99 * exchangeRate).toLocaleString()}</p>
                            )}
                            <ul className="space-y-3 pt-4 border-t border-white/5 text-sm font-light text-gray-300">
                                <li className="flex items-center gap-2.5">
                                    <Check size={16} className="text-purple-400" /> All Pro Features Included
                                </li>
                                <li className="flex items-center gap-2.5 font-bold text-white">
                                    <Check size={16} className="text-purple-400" /> 50% Discount on Fees
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <Check size={16} className="text-purple-400" /> Unlimited Team Collaboration
                                </li>
                                <li className="flex items-center gap-2.5">
                                    <Check size={16} className="text-purple-400" /> Dedicated Account Manager
                                </li>
                            </ul>
                        </div>
                        <div className="pt-8">
                            {subscription?.plan_tier === 'business' ? (
                                <Button variant="secondary" fullWidth className="border-white/10 cursor-default opacity-50">
                                    Active Plan
                                </Button>
                            ) : (
                                <Button
                                    onClick={() => handleUpgrade('BUSINESS')}
                                    disabled={processing}
                                    className="w-full bg-blue-600 hover:bg-blue-700 border-none text-white shadow-lg"
                                >
                                    {processing ? <Loader2 className="animate-spin mx-auto" size={18} /> : 'Upgrade to Business'}
                                </Button>
                            )}
                        </div>
                    </Card>
                </div>
            </div>

            {/* Feature Comparison Table */}
            <Card variant="glass" className="p-6 border-white/5 space-y-4">
                <h3 className="text-lg font-bold">Compare workspace plan features</h3>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse min-w-[600px]">
                        <thead>
                            <tr className="border-b border-white/10 text-gray-400 text-xs font-semibold uppercase tracking-wider">
                                <th className="py-4 px-2">Feature / Capacity</th>
                                <th className="py-4 px-4 text-center">Free Plan</th>
                                <th className="py-4 px-4 text-center">Pro Plan</th>
                                <th className="py-4 px-4 text-center text-purple-400">Business Plan</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5 text-gray-300 font-light">
                            <tr>
                                <td className="py-3.5 px-2 font-medium text-white">Notes Limit</td>
                                <td className="py-3.5 px-4 text-center">100 Notes</td>
                                <td className="py-3.5 px-4 text-center font-semibold text-white">Unlimited</td>
                                <td className="py-3.5 px-4 text-center font-semibold text-white">Unlimited</td>
                            </tr>
                            <tr>
                                <td className="py-3.5 px-2 font-medium text-white">Crypto Trading Spread</td>
                                <td className="py-3.5 px-4 text-center">1.0%</td>
                                <td className="py-3.5 px-4 text-center text-purple-400 font-medium">0.5% (50% Off)</td>
                                <td className="py-3.5 px-4 text-center text-purple-400 font-medium">0.5% (50% Off)</td>
                            </tr>
                            <tr>
                                <td className="py-3.5 px-2 font-medium text-white">System Fee Discount</td>
                                <td className="py-3.5 px-4 text-center">None</td>
                                <td className="py-3.5 px-4 text-center">20% Discount</td>
                                <td className="py-3.5 px-4 text-center text-blue-400 font-semibold">50% Discount</td>
                            </tr>
                            <tr>
                                <td className="py-3.5 px-2 font-medium text-white">Maximum Storage Capacity</td>
                                <td className="py-3.5 px-4 text-center">10 MB</td>
                                <td className="py-3.5 px-4 text-center">1 GB</td>
                                <td className="py-3.5 px-4 text-center">5 GB</td>
                            </tr>
                            <tr>
                                <td className="py-3.5 px-2 font-medium text-white">Priority Support</td>
                                <td className="py-3.5 px-4 text-center">AI Only</td>
                                <td className="py-3.5 px-4 text-center">Standard Support</td>
                                <td className="py-3.5 px-4 text-center text-purple-400 font-semibold">24/7 SLA Support</td>
                            </tr>
                            <tr>
                                <td className="py-3.5 px-2 font-medium text-white">Team Collaboration</td>
                                <td className="py-3.5 px-4 text-center">❌</td>
                                <td className="py-3.5 px-4 text-center">❌</td>
                                <td className="py-3.5 px-4 text-center text-emerald-400 font-semibold">✅ Unlimited Members</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </Card>

            {/* Real Billing History */}
            <Card variant="glass" className="p-6 border-white/5 space-y-4">
                <h3 className="text-lg font-bold">Billing & payment history</h3>
                <p className="text-xs text-gray-400 font-light">Every invoice below represents a verified record from the platform ledger.</p>
                
                <div className="border border-white/5 rounded-2xl overflow-hidden bg-white/[0.01]">
                    {historyLoading ? (
                        <div className="p-8 space-y-4 animate-pulse">
                            <div className="h-6 bg-white/5 rounded w-1/4" />
                            <div className="h-10 bg-white/5 rounded" />
                            <div className="h-10 bg-white/5 rounded" />
                            <div className="h-10 bg-white/5 rounded" />
                        </div>
                    ) : billingHistory.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center text-gray-400">
                            <FileText size={36} className="text-gray-600 mb-3" />
                            <h4 className="font-bold text-white text-sm">No payments recorded</h4>
                            <p className="text-xs font-light mt-1">Your payment and subscription history is currently empty.</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm border-collapse min-w-[700px]" role="table">
                                <thead>
                                    <tr className="border-b border-white/5 text-gray-500 text-[10px] uppercase font-bold tracking-widest bg-white/[0.01]">
                                        <th className="py-4 px-6">Invoice Number</th>
                                        <th className="py-4 px-4">Billing Date</th>
                                        <th className="py-4 px-4">Provider</th>
                                        <th className="py-4 px-4 text-right">Amount Charged</th>
                                        <th className="py-4 px-4 text-center">Status</th>
                                        <th className="py-4 px-6 text-right">Invoice Receipt</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5 font-light">
                                    {billingHistory.map((record) => {
                                        const date = new Date(record.created_at).toLocaleDateString('en-US', {
                                            year: 'numeric',
                                            month: 'short',
                                            day: 'numeric'
                                        });
                                        const upperStatus = (record.status || '').toUpperCase();
                                        
                                        return (
                                            <tr key={record.id} className="hover:bg-white/[0.01] transition-colors">
                                                <td className="py-4 px-6 font-mono text-xs font-semibold text-gray-300">
                                                    NS-INV-{record.id.substring(0, 8).toUpperCase()}
                                                </td>
                                                <td className="py-4 px-4 text-gray-300 text-xs">
                                                    {date}
                                                </td>
                                                <td className="py-4 px-4 capitalize text-gray-400 text-xs">
                                                    {record.provider}
                                                </td>
                                                <td className="py-4 px-4 text-right font-mono font-bold text-xs text-white">
                                                    {formatCurrency(record.amount, record.currency)}
                                                </td>
                                                <td className="py-4 px-4 text-center">
                                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${upperStatus === 'SUCCESS' || upperStatus === 'SUCCESSFUL' || upperStatus === 'COMPLETED' ? 'text-green-400 bg-green-500/10 border-green-500/20' : (upperStatus === 'FAILED' ? 'text-rose-400 bg-rose-500/10 border-rose-500/20' : 'text-amber-400 bg-amber-500/10 border-amber-500/20')}`}>
                                                        {upperStatus === 'SUCCESS' || upperStatus === 'SUCCESSFUL' || upperStatus === 'COMPLETED' ? 'Paid' : upperStatus}
                                                    </span>
                                                </td>
                                                <td className="py-4 px-6 text-right">
                                                    {record.transactionId && (upperStatus === 'SUCCESS' || upperStatus === 'SUCCESSFUL' || upperStatus === 'COMPLETED') ? (
                                                        <button
                                                            onClick={() => {
                                                                toast.promise(walletApi.downloadInvoice(record.transactionId!), {
                                                                    loading: 'Generating Receipt...',
                                                                    success: 'Receipt downloaded!',
                                                                    error: 'Failed to download receipt'
                                                                });
                                                            }}
                                                            className="inline-flex items-center gap-1.5 text-xs text-purple-400 hover:text-purple-300 font-semibold transition-colors border border-purple-500/20 hover:border-purple-500/40 bg-purple-500/5 hover:bg-purple-500/10 px-3 py-1 rounded-xl"
                                                        >
                                                            <FileText size={12} /> Receipt
                                                        </button>
                                                    ) : (
                                                        <span className="text-gray-600 text-xs italic">—</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </Card>

            {/* Secure Payment details note */}
            <div className="flex items-start gap-4 p-5 rounded-2xl bg-white/[0.02] border border-white/5">
                <div className="p-2 bg-purple-500/10 rounded-xl text-purple-400 border border-purple-500/20 shrink-0">
                    <ShieldCheck size={20} />
                </div>
                <div className="space-y-1">
                    <h4 className="font-bold text-sm text-white flex items-center gap-2">Secure payment operations</h4>
                    <p className="text-xs text-gray-400 font-light leading-relaxed">NoteStandard uses Paystack for credit card and bank transfer transactions. We do not store or process your sensitive billing credentials. Subscription transactions are verified cryptographically via Paystack webhooks and logged immutably on the institutional ledger.</p>
                </div>
            </div>

            {/* Cancel Modal */}
            {showCancelModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setShowCancelModal(false)} />
                    <Card variant="glass" className="relative max-w-md w-full p-6 border-white/10 space-y-6 animate-in fade-in zoom-in duration-200">
                        <div className="space-y-2">
                            <h3 className="text-lg font-black text-rose-400 flex items-center gap-2">Cancel your subscription?</h3>
                            <p className="text-gray-400 text-xs font-light leading-relaxed">Are you sure you want to cancel your {subscription?.plan_tier} subscription? Your access to all advanced notes features and fee discounts will end at the close of your current billing period.</p>
                        </div>
                        <div className="flex items-center justify-end gap-3 border-t border-white/5 pt-4">
                            <Button variant="ghost" className="text-gray-400 hover:text-white" onClick={() => setShowCancelModal(false)}>
                                Back
                            </Button>
                            <Button 
                                onClick={handleCancel}
                                disabled={processing}
                                className="bg-rose-600 hover:bg-rose-700 text-white border-none font-bold"
                            >
                                {processing ? <Loader2 className="animate-spin" size={16} /> : 'Confirm Cancellation'}
                            </Button>
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default Billing;
