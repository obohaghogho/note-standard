import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {

  Zap,
  CheckCircle2,
  ArrowLeft,
  Crown,
  RefreshCw,
  Receipt,
  Sparkles,
} from 'lucide-react-native';

const ZapIcon = Zap as any;
const CheckCircle2Icon = CheckCircle2 as any;
const ArrowLeftIcon = ArrowLeft as any;
const CrownIcon = Crown as any;
const RefreshCwIcon = RefreshCw as any;
const ReceiptIcon = Receipt as any;
const SparklesIcon = Sparkles as any;

import apiClient from '../../api/apiClient';
import { useAuth } from '../../context/AuthContext';

interface SubscriptionStatus {
  plan_tier: string;
  status: string;
  current_period_end?: string;
  cancel_at_period_end?: boolean;
}

interface PlanTier {
  id: 'free' | 'pro' | 'team' | 'business' | 'enterprise';
  title: string;
  monthlyPrice: number;
  yearlyPrice: number;
  badge?: string;
  features: string[];
}

const PLAN_TIERS: PlanTier[] = [
  {
    id: 'free',
    title: 'Free Plan',
    monthlyPrice: 0,
    yearlyPrice: 0,
    features: ['Standard note creation', 'Basic community access', 'Tier 1 & Tier 2 Wallet capabilities', 'Standard support'],
  },
  {
    id: 'pro',
    title: 'Pro Plan',
    monthlyPrice: 12,
    yearlyPrice: 120,
    badge: 'MOST POPULAR',
    features: ['Unlimited AI tutoring & notes', 'Full Advertising & Campaign Builder access', 'Priority USD/EUR/GBP accounts', 'Advanced community features', '24/7 Priority support'],
  },
  {
    id: 'team',
    title: 'Team Plan',
    monthlyPrice: 35,
    yearlyPrice: 350,
    features: ['Everything in Pro', 'Team workspace collaboration', 'Multi-member permission controls', 'Expanded daily wallet transaction limits'],
  },
  {
    id: 'business',
    title: 'Business Plan',
    monthlyPrice: 99,
    yearlyPrice: 990,
    badge: 'ENTERPRISE READY',
    features: ['Everything in Team', 'Custom ad campaign limits', 'Dedicated account manager', 'Custom API integration & SLAs'],
  },
];

interface SubscriptionPlansScreenProps {
  navigation: any;
}

export const SubscriptionPlansScreen: React.FC<SubscriptionPlansScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user, refreshProfile } = useAuth();

  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [subStatus, setSubStatus] = useState<SubscriptionStatus | null>(null);

  const [isYearly, setIsYearly] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);

  const fetchSubscriptionStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/subscription/status');
      if (res.data) {
        setSubStatus({
          plan_tier: res.data.plan_tier || res.data.plan || 'free',
          status: res.data.status || 'active',
          current_period_end: res.data.current_period_end,
          cancel_at_period_end: res.data.cancel_at_period_end,
        });
      }
    } catch (err) {
      console.warn('[SubscriptionPlans] Status fetch error:', err);
      setSubStatus({ plan_tier: user?.is_pro ? 'pro' : 'free', status: 'active' });
    } finally {
      setLoading(false);
    }
  }, [user?.is_pro]);

  useEffect(() => {
    fetchSubscriptionStatus();
  }, [fetchSubscriptionStatus]);

  // Sync Subscription with Server
  const handleSyncSubscription = async () => {
    try {
      setSyncing(true);
      const res = await apiClient.post('/subscription/sync');
      if (res.data?.success || res.data?.status) {
        await refreshProfile();
        await fetchSubscriptionStatus();
        Alert.alert('Subscription Synchronized', 'Your plan status has been updated from the authoritative billing engine.');
      }
    } catch (err: any) {
      Alert.alert('Sync Error', 'Failed to synchronize subscription status.');
    } finally {
      setSyncing(false);
    }
  };

  // Create Checkout Session
  const handleUpgradePlan = async (planId: string) => {
    if (planId === 'free') {
      Alert.alert('Current Plan', 'You are on the Free tier by default.');
      return;
    }

    try {
      setCheckoutLoading(planId);
      const res = await apiClient.post('/subscription/create-checkout-session', {
        plan_tier: planId,
        billing_cycle: isYearly ? 'yearly' : 'monthly',
      });

      const checkoutUrl = res.data?.checkout_url || res.data?.url;
      if (checkoutUrl) {
        // Open in browser
        await Linking.openURL(checkoutUrl);
        // On browser return, immediately sync
        handleSyncSubscription();
      } else {
        throw new Error('Server did not return a valid checkout session URL.');
      }
    } catch (err: any) {
      Alert.alert('Checkout Error', err.response?.data?.error || err.message || 'Failed to initialize checkout.');
    } finally {
      setCheckoutLoading(null);
    }
  };

  const currentPlanId = (subStatus?.plan_tier || 'free').toLowerCase();

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Subscription Plans</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={handleSyncSubscription} disabled={syncing}>
          <RefreshCwIcon size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Active Plan Banner */}
        <View style={styles.activeCard}>
          <View style={styles.activeHeader}>
            <CrownIcon size={24} color="#F59E0B" />
            <Text style={styles.activeTitle}>Active Subscription</Text>
          </View>

          <View style={styles.activeBadgeRow}>
            <View style={styles.planBadge}>
              <Text style={styles.planBadgeText}>
                CURRENT PLAN: {(subStatus?.plan_tier || 'FREE').toUpperCase()}
              </Text>
            </View>
            <TouchableOpacity style={styles.historyBtn} onPress={() => navigation.navigate('BillingHistory')}>
              <ReceiptIcon size={14} color="#3B82F6" />
              <Text style={styles.historyBtnText}>Invoices</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Billing Cycle Toggle */}
        <View style={styles.toggleContainer}>
          <TouchableOpacity
            style={[styles.toggleBtn, !isYearly && styles.toggleBtnActive]}
            onPress={() => setIsYearly(false)}
          >
            <Text style={[styles.toggleText, !isYearly && styles.toggleTextActive]}>Monthly Billing</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, isYearly && styles.toggleBtnActive]}
            onPress={() => setIsYearly(true)}
          >
            <Text style={[styles.toggleText, isYearly && styles.toggleTextActive]}>Yearly (Save 15%)</Text>
          </TouchableOpacity>
        </View>

        {loading ? (
          <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 30 }} />
        ) : (
          <View style={styles.plansGrid}>
            {PLAN_TIERS.map(plan => {
              const isCurrent = currentPlanId === plan.id;
              const price = isYearly ? plan.yearlyPrice : plan.monthlyPrice;

              return (
                <View key={plan.id} style={[styles.planCard, isCurrent && styles.planCardActive]}>
                  {plan.badge && (
                    <View style={styles.badgeLabel}>
                      <Text style={styles.badgeText}>{plan.badge}</Text>
                    </View>
                  )}

                  <Text style={styles.planTitle}>{plan.title}</Text>

                  <View style={styles.priceRow}>
                    <Text style={styles.priceSymbol}>$</Text>
                    <Text style={styles.priceAmount}>{price}</Text>
                    <Text style={styles.pricePeriod}>/{isYearly ? 'yr' : 'mo'}</Text>
                  </View>

                  <View style={styles.featureList}>
                    {plan.features.map((feat, idx) => (
                      <View key={idx} style={styles.featureRow}>
                        <CheckCircle2Icon size={16} color={isCurrent ? '#10B981' : '#3B82F6'} />
                        <Text style={styles.featureText}>{feat}</Text>
                      </View>
                    ))}
                  </View>

                  <TouchableOpacity
                    style={[
                      styles.actionBtn,
                      isCurrent && styles.actionBtnCurrent,
                      plan.id === 'free' && !isCurrent && styles.actionBtnDisabled,
                    ]}
                    onPress={() => handleUpgradePlan(plan.id)}
                    disabled={isCurrent || (plan.id === 'free' && !isCurrent) || checkoutLoading !== null}
                  >
                    {checkoutLoading === plan.id ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Text style={styles.actionBtnText}>
                        {isCurrent ? '✓ Active Plan' : plan.id === 'free' ? 'Default Tier' : `Upgrade to ${plan.title}`}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  backBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  refreshBtn: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  scrollContent: {
    padding: 20,
  },
  activeCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.3)',
    marginBottom: 20,
  },
  activeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  activeTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  activeBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.3)',
  },
  planBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#34D399',
  },
  historyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  historyBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#3B82F6',
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 4,
    marginBottom: 20,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
  },
  toggleBtnActive: {
    backgroundColor: '#3B82F6',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  toggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  plansGrid: {
    gap: 20,
  },
  planCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    position: 'relative',
  },
  planCardActive: {
    borderColor: '#10B981',
    backgroundColor: 'rgba(16, 185, 129, 0.05)',
  },
  badgeLabel: {
    position: 'absolute',
    top: 16,
    right: 16,
    backgroundColor: '#F59E0B',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0F172A',
  },
  planTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 16,
  },
  priceSymbol: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  priceAmount: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  pricePeriod: {
    fontSize: 13,
    color: '#94A3B8',
    marginLeft: 2,
  },
  featureList: {
    gap: 10,
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureText: {
    fontSize: 13,
    color: '#CBD5E1',
    flex: 1,
  },
  actionBtn: {
    backgroundColor: '#3B82F6',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
  },
  actionBtnCurrent: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  actionBtnDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
