import { useState, useEffect, useRef } from 'react';
import { API_URL } from '../../lib/api';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Check, CreditCard, Loader2, Zap, X, Mail, Calendar, BadgeCheck } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { supabase } from '../../lib/supabase';
import { supabaseSafe } from '../../lib/supabaseSafe';

interface Subscription {
    id: string;
    plan_tier: string;
    status: string;
    created_at: string;
    stripe_customer_id?: string;
}

export const Billing = () => {
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(true);
    const [isPro, setIsPro] = useState(false);
    const [processing, setProcessing] = useState(false);
    const [subscription, setSubscription] = useState<Subscription | null>(null);
    const [showDetails, setShowDetails] = useState(false);

    const fetchingRef = useRef(false);
    const isMounted = useRef(true);

    useEffect(() => {
        isMounted.current = true;
        checkSubscriptionStatus();

        // Handle redirect from Paystack
        const reference = searchParams.get('reference');
        // Paystack doesn't typically send 'success' param unless we add it, but it sends reference
        
        if (reference) {
            syncSubscription(reference);
        }
        
        return () => { isMounted.current = false; };
    }, [searchParams]);

    const [exchangeRate, setExchangeRate] = useState<number | null>(null);

    const checkSubscriptionStatus = async () => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;

        await supabaseSafe('billing-status', async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token;
            if (!token) return; 

            // Fetch Subscription Status
            const response = await fetch(`${API_URL}/api/subscription/status`, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (!response.ok) throw new Error('Failed to fetch subscription status');

            const data = await response.json();
            
            if (isMounted.current) {
                if (data.subscription?.status === 'active' && data.subscription?.plan_tier === 'pro') {
                    setIsPro(true);
                    setSubscription(data.subscription);
                }
            }

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
            
            return data;
        });
        
        if (isMounted.current) {
            setLoading(false);
            fetchingRef.current = false;
        }
    };

    const syncSubscription = async (reference: string) => {
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
                setIsPro(true);
                toast.success('Successfully upgraded to Pro!');
                // Remove query params to clean URL
                window.history.replaceState({}, '', '/dashboard/billing');
                checkSubscriptionStatus(); // Refresh status
            } else {
                toast.error('Verification failed. Please contact support.');
            }
        } catch (error) {
            console.error('Sync error:', error);
            toast.error('Failed to verify subscription');
        } finally {
            setProcessing(false);
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
                body: JSON.stringify({ planType })
            });

            const dataRes = await response.json();
            if (dataRes.url) {
                console.log('Redirecting to Paystack:', dataRes.url);
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
        if (!confirm('Are you sure you want to cancel your PRO subscription?')) return;
        
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
                toast.success('Subscription canceled');
                setIsPro(false);
                setSubscription(null);
                setShowDetails(false);
            } else {
                toast.error('Failed to cancel subscription');
            }
        } catch (error) {
            console.error('Cancel error:', error);
            toast.error('Failed to cancel');
        } finally {
            setProcessing(false);
        }
    };

    const handleManageSubscription = () => {
        setShowDetails(!showDetails);
    };

    if (loading && !processing) {
        return (
            <div className="flex items-center justify-center py-20">
                <Loader2 className="animate-spin text-primary" size={32} />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-6xl mx-auto">
            <div className="space-y-1">
                <h1 className="text-3xl font-bold">Plan & Subscription</h1>
                <p className="text-gray-400">Manage your subscription and billing details</p>
            </div>

            {processing && (
                <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 p-4 rounded-lg flex items-center gap-3">
                    <Loader2 className="animate-spin" size={20} />
                    Processing your subscription update...
                </div>
            )}

            <div className="grid md:grid-cols-3 gap-6">
                {/* Free Plan */}
                <Card className={`p-6 border-2 ${subscription?.plan_tier === 'FREE' || !isPro ? 'border-primary bg-primary/5' : 'border-white/5'} transition-colors relative overflow-hidden`}>
                    {(!isPro && subscription?.plan_tier !== 'BUSINESS') && (
                        <div className="absolute top-0 right-0 bg-primary text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                            CURRENT
                        </div>
                    )}
                    <h3 className="text-xl font-bold mb-2">Free Plan</h3>
                    <div className="text-3xl font-bold mb-4">$0 <span className="text-sm font-normal text-gray-400">/ month</span></div>
                    <p className="text-gray-400 mb-6 text-sm">Perfect for getting started with basic note taking.</p>

                    <ul className="space-y-3 mb-8">
                        <li className="flex items-center gap-2 text-sm">
                            <Check size={16} className="text-green-500" /> 100 Notes
                        </li>
                        <li className="flex items-center gap-2 text-sm">
                            <Check size={16} className="text-green-500" /> 1.0% Crypto Spread
                        </li>
                        <li className="flex items-center gap-2 text-sm">
                            <Check size={16} className="text-green-500" /> Standard Fees
                        </li>
                        <li className="flex items-center gap-2 text-sm text-gray-500">
                            <XComp size={16} /> Priority Support
                        </li>
                    </ul>

                    <Button
                        variant="secondary"
                        fullWidth
                        disabled={!isPro}
                        className={!isPro ? "opacity-50 cursor-default" : ""}
                    >
                        {!isPro ? 'Active' : 'Downgrade'}
                    </Button>
                </Card>

                {/* Pro Plan */}
                <Card className={`p-6 border-2 ${subscription?.plan_tier === 'PRO' ? 'border-primary bg-primary/5' : 'border-white/5 relative group'}`}>
                    {subscription?.plan_tier === 'PRO' && (
                        <div className="absolute top-0 right-0 bg-primary text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                            ACTIVE
                        </div>
                    )}
                    {!isPro && <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl opacity-20 blur group-hover:opacity-40 transition duration-1000"></div>}
                    <div className="relative">
                        <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                            Pro Plan <Zap size={18} className="text-yellow-400 fill-yellow-400" />
                        </h3>
                        <div className="mb-4">
                            <div className="text-3xl font-bold">$9.99 <span className="text-sm font-normal text-gray-400">/ month</span></div>
                            {exchangeRate && (
                                <div className="text-sm text-gray-400 mt-1">
                                    Approx. {new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(9.99 * exchangeRate)}
                                </div>
                            )}
                        </div>
                        <p className="text-gray-400 mb-6 text-sm">Unlock the full power of Note Standard.</p>

                        <ul className="space-y-3 mb-8">
                            <li className="flex items-center gap-2 text-sm">
                                <Check size={16} className="text-green-500" /> Unlimited Notes
                            </li>
                            <li className="flex items-center gap-2 text-sm">
                                <Check size={16} className="text-green-500" /> <b>0.5% Crypto Spread</b>
                            </li>
                            <li className="flex items-center gap-2 text-sm">
                                <Check size={16} className="text-green-500" /> 20% Discount on Fees
                            </li>
                            <li className="flex items-center gap-2 text-sm">
                                <Check size={16} className="text-green-500" /> Priority Support
                            </li>
                        </ul>

                        {subscription?.plan_tier === 'PRO' ? (
                            <Button variant="secondary" fullWidth onClick={handleManageSubscription} disabled={processing}>
                                {processing ? <Loader2 className="animate-spin" /> : 'Manage'}
                            </Button>
                        ) : (
                            <Button
                                onClick={() => handleUpgrade('PRO')}
                                disabled={processing}
                                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 border-none text-white shadow-lg shadow-purple-900/20"
                            >
                                {processing ? <Loader2 className="animate-spin" /> : 'Upgrade Pro'}
                            </Button>
                        )}
                    </div>
                </Card>

                {/* Business Plan */}
                <Card className={`p-6 border-2 ${subscription?.plan_tier === 'BUSINESS' ? 'border-primary bg-primary/5' : 'border-white/5 relative group'}`}>
                    {subscription?.plan_tier === 'BUSINESS' && (
                        <div className="absolute top-0 right-0 bg-primary text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                            ENTERPRISE
                        </div>
                    )}
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl opacity-20 blur group-hover:opacity-40 transition duration-1000"></div>
                    <div className="relative">
                        <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                            Business <BadgeCheck size={18} className="text-blue-400" />
                        </h3>
                        <div className="mb-4">
                            <div className="text-3xl font-bold">$29.99 <span className="text-sm font-normal text-gray-400">/ month</span></div>
                            {exchangeRate && (
                                <div className="text-sm text-gray-400 mt-1">
                                    Approx. {formatCurrency(29.99 * exchangeRate, 'NGN')}
                                </div>
                            )}
                        </div>
                        <p className="text-gray-400 mb-6 text-sm">Maximum limits & premium tools for scale.</p>

                        <ul className="space-y-3 mb-8">
                            <li className="flex items-center gap-2 text-sm">
                                <Check size={16} className="text-green-500" /> All Pro Features
                            </li>
                            <li className="flex items-center gap-2 text-sm text-blue-400 font-bold">
                                <Check size={16} className="text-blue-500" /> 0.5% Crypto Spread
                            </li>
                            <li className="flex items-center gap-2 text-sm">
                                <Check size={16} className="text-green-500" /> 50% Discount on Fees
                            </li>
                            <li className="flex items-center gap-2 text-sm">
                                <Check size={16} className="text-green-500" /> Unlimited Team Members
                            </li>
                        </ul>

                        {subscription?.plan_tier === 'BUSINESS' ? (
                            <Button variant="secondary" fullWidth onClick={handleManageSubscription} disabled={processing}>
                                {processing ? <Loader2 className="animate-spin" /> : 'Manage'}
                            </Button>
                        ) : (
                            <Button
                                onClick={() => handleUpgrade('BUSINESS')}
                                disabled={processing}
                                className="w-full bg-blue-600 hover:bg-blue-700 border-none text-white shadow-lg"
                            >
                                {processing ? <Loader2 className="animate-spin" /> : 'Get Business'}
                            </Button>
                        )}
                    </div>
                </Card>
            </div>

            {/* Subscription Details Panel */}
            {showDetails && subscription && (
                <Card variant="glass" className="p-6 border border-primary/20">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-semibold flex items-center gap-2">
                            <BadgeCheck className="text-blue-400" size={20} />
                            Your {subscription.plan_tier} Subscription
                        </h3>
                        <button
                            onClick={() => setShowDetails(false)}
                            className="text-gray-400 hover:text-white transition-colors"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                            <Calendar size={18} className="text-gray-400" />
                            <div>
                                <p className="text-sm text-gray-400">Member since</p>
                                <p className="font-medium">{new Date(subscription.created_at).toLocaleDateString('en-US', {
                                    year: 'numeric',
                                    month: 'long',
                                    day: 'numeric'
                                })}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                            <CreditCard size={18} className="text-gray-400" />
                            <div>
                                <p className="text-sm text-gray-400">Plan</p>
                                <p className="font-medium capitalize">{subscription.plan_tier}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 p-3 bg-white/5 rounded-lg">
                            <Check size={18} className="text-green-400" />
                            <div>
                                <p className="text-sm text-gray-400">Status</p>
                                <p className="font-medium text-green-400 capitalize">{subscription.status}</p>
                            </div>
                        </div>

                        <div className="mt-6 p-4 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                            <div className="flex items-start gap-3">
                                <Mail size={20} className="text-orange-400 mt-0.5" />
                                <div>
                                    <h4 className="font-medium text-orange-400 mb-1">Manage Subscription</h4>
                                    <p className="text-sm text-gray-400 mb-3">
                                        You can cancel your subscription at any time. Your access will continue until the end of the billing period.
                                    </p>
                                    <button
                                        onClick={handleCancel}
                                        disabled={processing}
                                        className="inline-flex items-center gap-2 text-sm text-red-400 hover:text-red-300 font-medium transition-colors"
                                    >
                                        <X size={14} />
                                        {processing ? 'Processing...' : 'Cancel Subscription'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>
            )}
            <div className="mt-8 p-4 rounded-lg bg-white/5 border border-white/10 flex items-start gap-4">
                <div className="p-2 bg-white/10 rounded-full">
                    <CreditCard size={20} className="text-gray-300" />
                </div>
                <div>
                    <h4 className="font-semibold text-white mb-1">Secure Payment</h4>
                    <p className="text-sm text-gray-400">
                        All payments are processed securely by Paystack. We do not store your credit card information.
                    </p>
                </div>
            </div>
        </div>
    );
};

const formatCurrency = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency }).format(amount);
};

const XComp = ({ size, className }: { size?: number, className?: string }) => (
    <svg
        xmlns="http://www.w3.org/2000/svg"
        width={size || 24}
        height={size || 24}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={className}
    >
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
    </svg>
);
