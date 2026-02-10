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

        // Handle redirect from Stripe
        const success = searchParams.get('success');
        const session_id = searchParams.get('session_id');
        const canceled = searchParams.get('canceled');

        if (success && session_id) {
            syncSubscription(session_id);
        } else if (canceled) {
            toast('Subscription cancelled', { icon: 'ℹ️' });
        }
        
        return () => { isMounted.current = false; };
    }, [searchParams]);

    const checkSubscriptionStatus = async () => {
        if (fetchingRef.current) return;
        fetchingRef.current = true;

        await supabaseSafe('billing-status', async () => {
            const { data: sessionData } = await supabase.auth.getSession();
            const token = sessionData.session?.access_token;
            if (!token) return; 

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
            return data;
        });
        
        if (isMounted.current) {
            setLoading(false);
            fetchingRef.current = false;
        }
    };

    const syncSubscription = async (sessionId: string) => {
        setProcessing(true);
        try {
            const token = (await import('../../lib/supabase')).supabase.auth.getSession().then(({ data }) => data.session?.access_token);
            const resolvedToken = await token;

            const response = await fetch(`${API_URL}/api/subscription/sync`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${resolvedToken}`
                },
                body: JSON.stringify({ session_id: sessionId })
            });

            const data = await response.json();
            if (data.success) {
                setIsPro(true);
                toast.success('Successfully upgraded to Pro!');
                // Remove query params to clean URL
                window.history.replaceState({}, '', '/dashboard/billing');
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

    const handleUpgrade = async () => {
        console.log('Upgrade button clicked!');
        setProcessing(true);
        try {
            const token = (await import('../../lib/supabase')).supabase.auth.getSession().then(({ data }) => data.session?.access_token);
            const resolvedToken = await token;
            console.log('Token obtained:', resolvedToken ? 'Yes' : 'No');

            const response = await fetch(`${API_URL}/api/subscription/create-checkout-session`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${resolvedToken}`
                }
            });

            const data = await response.json();
            console.log('Checkout session response:', data);
            if (data.url) {
                console.log('Redirecting to Stripe:', data.url);
                window.location.href = data.url;
            } else {
                throw new Error('No checkout URL received');
            }
        } catch (error) {
            console.error('Upgrade error:', error);
            toast.error('Failed to start checkout');
            setProcessing(false);
        }
    };

    const handleManageSubscription = () => {
        console.log('handleManageSubscription called, showDetails:', showDetails, 'subscription:', subscription);
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
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="space-y-1">
                <h1 className="text-3xl font-bold">Billing & Plans</h1>
                <p className="text-gray-400">Manage your subscription and billing details</p>
            </div>

            {processing && (
                <div className="bg-blue-500/10 border border-blue-500/20 text-blue-400 p-4 rounded-lg flex items-center gap-3">
                    <Loader2 className="animate-spin" size={20} />
                    Processing your subscription update...
                </div>
            )}

            <div className="grid md:grid-cols-2 gap-6">
                {/* Free Plan */}
                <Card className={`p-6 border-2 ${!isPro ? 'border-primary bg-primary/5' : 'border-white/5'} transition-colors relative overflow-hidden`}>
                    {!isPro && (
                        <div className="absolute top-0 right-0 bg-primary text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                            CURRENT PLAN
                        </div>
                    )}
                    <h3 className="text-xl font-bold mb-2">Free Plan</h3>
                    <div className="text-3xl font-bold mb-4">$0 <span className="text-sm font-normal text-gray-400">/ month</span></div>
                    <p className="text-gray-400 mb-6">Perfect for getting started with basic note taking.</p>

                    <ul className="space-y-3 mb-8">
                        <li className="flex items-center gap-2 text-sm">
                            <Check size={16} className="text-green-500" /> 100 Notes
                        </li>
                        <li className="flex items-center gap-2 text-sm">
                            <Check size={16} className="text-green-500" /> Basic Search
                        </li>
                        <li className="flex items-center gap-2 text-sm">
                            <Check size={16} className="text-green-500" /> Community Access
                        </li>
                        <li className="flex items-center gap-2 text-sm text-gray-500">
                            <XComp size={16} /> AI Features
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
                <Card className={`p-6 border-2 ${isPro ? 'border-primary bg-primary/5' : 'border-white/5 relative group'}`}>
                    {isPro && (
                        <div className="absolute top-0 right-0 bg-primary text-white text-xs font-bold px-3 py-1 rounded-bl-lg">
                            ACTIVE
                        </div>
                    )}
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-pink-600 to-purple-600 rounded-xl opacity-20 blur group-hover:opacity-40 transition duration-1000"></div>
                    <div className="relative">
                        <h3 className="text-xl font-bold mb-2 flex items-center gap-2">
                            Pro Plan <Zap size={18} className="text-yellow-400 fill-yellow-400" />
                        </h3>
                        <div className="text-3xl font-bold mb-4">$9.99 <span className="text-sm font-normal text-gray-400">/ month</span></div>
                        <p className="text-gray-400 mb-6">Unlock the full power of Note Standard.</p>

                        <ul className="space-y-3 mb-8">
                            <li className="flex items-center gap-2 text-sm">
                                <Check size={16} className="text-green-500" /> Unlimited Notes
                            </li>
                            <li className="flex items-center gap-2 text-sm">
                                <Check size={16} className="text-green-500" /> Priority Support
                            </li>
                            <li className="flex items-center gap-2 text-sm">
                                <Check size={16} className="text-green-500" /> Advanced AI Analytics
                            </li>
                            <li className="flex items-center gap-2 text-sm">
                                <Check size={16} className="text-green-500" /> Early Access Features
                            </li>
                        </ul>

                        {isPro ? (
                            <Button variant="secondary" fullWidth onClick={handleManageSubscription} disabled={processing}>
                                {processing ? <Loader2 className="animate-spin" /> : 'Manage Subscription'}
                            </Button>
                        ) : (
                            <Button
                                onClick={handleUpgrade}
                                disabled={processing}
                                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 border-none text-white shadow-lg shadow-purple-900/20"
                            >
                                {processing ? <Loader2 className="animate-spin" /> : 'Upgrade Now'}
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
                            Your Pro Subscription
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
                                <p className="font-medium capitalize">{subscription.plan_tier} - ${9.99}/month</p>
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
                                    <h4 className="font-medium text-orange-400 mb-1">Need to Cancel?</h4>
                                    <p className="text-sm text-gray-400 mb-3">
                                        To cancel or modify your subscription, please contact our support team.
                                    </p>
                                    <a
                                        href="mailto:support@notestandard.com?subject=Cancel%20Pro%20Subscription"
                                        className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 font-medium"
                                    >
                                        <Mail size={14} />
                                        Contact Support to Cancel
                                    </a>
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
                        All payments are processed securely by Stripe. We do not store your credit card information.
                    </p>
                </div>
            </div>
        </div>
    );
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
