import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
  Image,
  Modal,
  TextInput,
  Alert,
  FlatList,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Megaphone,
  TrendingUp,
  PlusCircle,
  Lock,
  ArrowLeft,
  DollarSign,
  Eye,
  MousePointer,
  RefreshCw,
  Zap,
} from 'lucide-react-native';

const MegaphoneIcon = Megaphone as any;
const TrendingUpIcon = TrendingUp as any;
const PlusCircleIcon = PlusCircle as any;
const LockIcon = Lock as any;
const ArrowLeftIcon = ArrowLeft as any;
const DollarSignIcon = DollarSign as any;
const EyeIcon = Eye as any;
const MousePointerIcon = MousePointer as any;
const RefreshCwIcon = RefreshCw as any;
const ZapIcon = Zap as any;

import apiClient from '../../api/apiClient';
import { useAuth } from '../../context/AuthContext';

export interface AdCampaign {
  id: string;
  title: string;
  content: string;
  image_url?: string;
  link_url?: string;
  status: 'pending' | 'approved' | 'rejected' | 'paused' | 'paused_funds';
  views?: number;
  clicks?: number;
  cpc_bid?: number;
  created_at: string;
}

interface AuctionIntel {
  medianCpc: number;
  topCpc: number;
  totalBidders: number;
  recommendedBid: number;
}

interface AdsDashboardScreenProps {
  navigation: any;
}

const getStatusBadgeStyle = (status: string) => {
  switch (status) {
    case 'approved': return styles.status_approved;
    case 'pending': return styles.status_pending;
    case 'rejected': return styles.status_rejected;
    default: return styles.status_paused;
  }
};

export const AdsDashboardScreen: React.FC<AdsDashboardScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isAuthorized, setIsAuthorized] = useState(true);

  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [intel, setIntel] = useState<AuctionIntel | null>(null);

  // Top-Up Modal
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('50');
  const [toppingUp, setToppingUp] = useState(false);

  const fetchAdsData = useCallback(async () => {
    try {
      setLoading(true);
      const [intelRes, myAdsRes] = await Promise.allSettled([
        apiClient.get('/ads/auction-intel'),
        apiClient.get('/ads/my-ads'),
      ]);

      if (intelRes.status === 'fulfilled' && intelRes.value.data) {
        setIntel(intelRes.value.data);
      }

      if (myAdsRes.status === 'fulfilled') {
        setCampaigns(myAdsRes.value.data || []);
        setIsAuthorized(true);
      } else if (myAdsRes.status === 'rejected' && myAdsRes.reason?.response?.status === 403) {
        setIsAuthorized(false);
      }
    } catch (err) {
      console.warn('[AdsDashboard] Error fetching ads:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAdsData();
  }, [fetchAdsData]);

  // Submit Ad Wallet Top Up
  const handleTopUp = async () => {
    const amountNum = parseFloat(topUpAmount);
    if (!amountNum || amountNum < 5) {
      Alert.alert('Validation Error', 'Minimum top-up amount is $5.00');
      return;
    }

    try {
      setToppingUp(true);
      const res = await apiClient.post('/ads/topup', { amount: amountNum });
      if (res.data?.success) {
        Alert.alert('Top-Up Successful', `$${amountNum.toFixed(2)} added to your Ad Wallet.`);
        setShowTopUpModal(false);
        fetchAdsData();
      } else {
        throw new Error(res.data?.error || 'Top-up transaction failed.');
      }
    } catch (err: any) {
      Alert.alert('Top-Up Error', err.response?.data?.error || err.message || 'Failed to top-up ad balance.');
    } finally {
      setToppingUp(false);
    }
  };

  // Aggregated Stats
  const totalViews = campaigns.reduce((acc, c) => acc + (c.views || 0), 0);
  const totalClicks = campaigns.reduce((acc, c) => acc + (c.clicks || 0), 0);

  return (
    <View style={styles.container}>
      {/* Header Bar */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <ArrowLeftIcon size={22} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Advertising Portal</Text>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchAdsData} disabled={loading}>
          <RefreshCwIcon size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {!isAuthorized ? (
        // Server Role-Gated Lock Screen
        <View style={styles.lockedContainer}>
          <LockIcon size={48} color="#64748B" />
          <Text style={styles.lockedTitle}>Advertiser Access Required</Text>
          <Text style={styles.lockedSub}>
            Creating ad campaigns and bidding in the auction is available for Pro and Business account tiers.
          </Text>
          <TouchableOpacity style={styles.upgradeBtn} onPress={() => navigation.navigate('Profile')}>
            <ZapIcon size={18} color="#FFFFFF" />
            <Text style={styles.upgradeBtnText}>Upgrade Account Tier</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchAdsData} tintColor="#3B82F6" />}
        >
          {/* Auction Market Intel Banner */}
          <View style={styles.intelCard}>
            <View style={styles.intelHeader}>
              <TrendingUpIcon size={22} color="#34D399" />
              <Text style={styles.intelTitle}>Ad Auction Market Intel</Text>
            </View>

            <View style={styles.intelGrid}>
              <View style={styles.intelBox}>
                <Text style={styles.intelValue}>${intel?.medianCpc?.toFixed(2) || '0.05'}</Text>
                <Text style={styles.intelLabel}>Median CPC</Text>
              </View>
              <View style={styles.intelBox}>
                <Text style={styles.intelValue}>${intel?.topCpc?.toFixed(2) || '0.10'}</Text>
                <Text style={styles.intelLabel}>Top CPC Bid</Text>
              </View>
              <View style={styles.intelBox}>
                <Text style={styles.intelValue}>${intel?.recommendedBid?.toFixed(2) || '0.07'}</Text>
                <Text style={styles.intelLabel}>Recommended</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.topUpBtn} onPress={() => setShowTopUpModal(true)}>
              <DollarSignIcon size={18} color="#FFFFFF" />
              <Text style={styles.topUpBtnText}>Top-Up Ad Balance</Text>
            </TouchableOpacity>
          </View>

          {/* Aggregated Analytics Card */}
          <View style={styles.analyticsCard}>
            <Text style={styles.sectionTitle}>Campaign Performance</Text>
            <View style={styles.analyticsRow}>
              <View style={styles.analyticsBox}>
                <EyeIcon size={20} color="#3B82F6" />
                <Text style={styles.analyticsValue}>{totalViews.toLocaleString()}</Text>
                <Text style={styles.analyticsLabel}>Impressions</Text>
              </View>
              <View style={styles.analyticsBox}>
                <MousePointerIcon size={20} color="#F59E0B" />
                <Text style={styles.analyticsValue}>{totalClicks.toLocaleString()}</Text>
                <Text style={styles.analyticsLabel}>Clicks</Text>
              </View>
            </View>
          </View>

          {/* Active Campaigns Section */}
          <View style={styles.campaignsHeader}>
            <Text style={styles.sectionTitle}>Your Ad Campaigns ({campaigns.length})</Text>
            <TouchableOpacity
              style={styles.newCampaignBtn}
              onPress={() => navigation.navigate('CampaignBuilder')}
            >
              <PlusCircleIcon size={16} color="#FFFFFF" />
              <Text style={styles.newCampaignText}>New Ad</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 20 }} />
          ) : campaigns.length === 0 ? (
            <View style={styles.emptyCard}>
              <MegaphoneIcon size={36} color="#64748B" />
              <Text style={styles.emptyTitle}>No Active Campaigns</Text>
              <Text style={styles.emptySub}>Build your first ad campaign to promote your brand to NoteStandard users.</Text>
            </View>
          ) : (
            campaigns.map(ad => (
              <View key={ad.id} style={styles.adCard}>
                <View style={styles.adCardHeader}>
                  <Text style={styles.adTitle} numberOfLines={1}>
                    {ad.title}
                  </Text>
                  <View style={[styles.statusBadge, getStatusBadgeStyle(ad.status)]}>
                    <Text style={styles.statusText}>{ad.status.toUpperCase()}</Text>
                  </View>
                </View>

                <Text style={styles.adContent} numberOfLines={2}>
                  {ad.content}
                </Text>

                <View style={styles.adMetaRow}>
                  <Text style={styles.adMetaText}>👁 {ad.views || 0} views</Text>
                  <Text style={styles.adMetaText}>👆 {ad.clicks || 0} clicks</Text>
                  <Text style={styles.adMetaText}>💰 ${Number(ad.cpc_bid || 0.05).toFixed(2)} CPC</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* TOP UP AD BALANCE MODAL */}
      <Modal visible={showTopUpModal} transparent animationType="slide" onRequestClose={() => setShowTopUpModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Top-Up Ad Wallet</Text>
            <Text style={styles.modalSub}>Enter amount to add funds to your advertising budget.</Text>

            <TextInput
              style={styles.modalInput}
              value={topUpAmount}
              onChangeText={setTopUpAmount}
              placeholder="50.00"
              placeholderTextColor="#64748B"
              keyboardType="decimal-pad"
            />

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowTopUpModal(false)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalSubmitBtn} onPress={handleTopUp} disabled={toppingUp}>
                {toppingUp ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.modalSubmitText}>Confirm Top-Up</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  lockedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  lockedTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 16,
    marginBottom: 8,
  },
  lockedSub: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 20,
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 14,
  },
  upgradeBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  intelCard: {
    backgroundColor: 'rgba(30, 41, 59, 0.7)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(52, 211, 153, 0.3)',
    marginBottom: 20,
  },
  intelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  intelTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  intelGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  intelBox: {
    flex: 1,
    backgroundColor: '#0F172A',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  intelValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#34D399',
    marginBottom: 2,
  },
  intelLabel: {
    fontSize: 11,
    color: '#94A3B8',
  },
  topUpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#10B981',
    paddingVertical: 12,
    borderRadius: 14,
  },
  topUpBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  analyticsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 14,
  },
  analyticsRow: {
    flexDirection: 'row',
    gap: 14,
  },
  analyticsBox: {
    flex: 1,
    backgroundColor: '#0F172A',
    borderRadius: 14,
    padding: 14,
  },
  analyticsValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    marginVertical: 4,
  },
  analyticsLabel: {
    fontSize: 12,
    color: '#94A3B8',
  },
  campaignsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  newCampaignBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#3B82F6',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
  },
  newCampaignText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyCard: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 30,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 10,
    marginBottom: 4,
  },
  emptySub: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
  },
  adCard: {
    backgroundColor: '#1E293B',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  adCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  adTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    marginRight: 10,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  status_approved: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  status_pending: {
    backgroundColor: 'rgba(245, 158, 11, 0.2)',
  },
  status_rejected: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  status_paused: {
    backgroundColor: 'rgba(100, 116, 139, 0.2)',
  },
  status_paused_funds: {
    backgroundColor: 'rgba(239, 68, 68, 0.2)',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  adContent: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 12,
    lineHeight: 18,
  },
  adMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  adMetaText: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#0F172A',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    borderTopWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 6,
  },
  modalSub: {
    fontSize: 13,
    color: '#94A3B8',
    marginBottom: 18,
  },
  modalInput: {
    backgroundColor: '#1E293B',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#FFFFFF',
    fontSize: 16,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94A3B8',
  },
  modalSubmitBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: '#10B981',
    alignItems: 'center',
  },
  modalSubmitText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
