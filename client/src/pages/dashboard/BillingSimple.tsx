import React, { useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { supabaseSafe } from "../../lib/supabaseSafe";
import { supabase } from "../../lib/supabase";
import { API_URL } from "../../lib/api";
import toast from "react-hot-toast";

interface SubscriptionData {
  id: string;
  plan_tier: string;
  status: string;
  created_at: string;
  stripe_customer_id?: string;
}

export const BillingSimple: React.FC = () => {
  const { subscription: authSubscription } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  // Sync with AuthContext subscription
  useEffect(() => {
    if (authSubscription) {
      setSubscription(authSubscription as SubscriptionData);
      setLoading(false);
    } else {
      // If authReady is true but no subscription, we stopped loading
      setLoading(false);
    }
  }, [authSubscription]);

  /**
   * Upgrade to Pro (Stripe checkout)
   */
  const handleUpgrade = async () => {
    if (processing) return;
    setProcessing(true);

    try {
      const result = await supabaseSafe('billing-create-checkout', async () => {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('No auth token');

        const response = await fetch(`${API_URL}/api/subscription/create-checkout-session`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) throw new Error('Checkout failed');
        return await response.json();
      });

      if (result?.url) {
        window.location.href = result.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Upgrade error:', error);
      toast.error('Failed to start checkout');
    } finally {
      setProcessing(false);
    }
  };

  // No local fetch needed, using AuthContext


  if (loading) return <div className="p-4">Loading billing info...</div>;

  return (
    <div className="p-4 space-y-4">
      <h2 className="text-2xl font-bold">Billing & Subscription</h2>

      {!subscription && (
        <div className="p-4 bg-white/5 rounded-lg">
          <p className="text-gray-400 mb-4">No active subscription</p>
          <button
            onClick={handleUpgrade}
            disabled={processing}
            className="px-4 py-2 bg-primary text-white rounded-lg hover:bg-primary/80 disabled:opacity-50"
          >
            {processing ? 'Processing...' : 'Upgrade to Pro'}
          </button>
        </div>
      )}

      {subscription && (
        <div className="p-4 bg-white/5 rounded-lg space-y-2">
          <div>
            <span className="text-sm text-gray-400">Plan: </span>
            <span className="font-medium capitalize">{subscription.plan_tier}</span>
          </div>
          <div>
            <span className="text-sm text-gray-400">Status: </span>
            <span className="font-medium capitalize">{subscription.status}</span>
          </div>
          <div>
            <span className="text-sm text-gray-400">Member since: </span>
            <span className="font-medium">
              {new Date(subscription.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
