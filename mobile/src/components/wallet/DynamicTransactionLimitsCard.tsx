import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { ShieldCheck, TrendingUp, ArrowRight, Zap, RefreshCw } from 'lucide-react-native';

const ShieldCheckIcon = ShieldCheck as any;
const TrendingUpIcon = TrendingUp as any;
const ArrowRightIcon = ArrowRight as any;
const ZapIcon = Zap as any;
const RefreshCwIcon = RefreshCw as any;

import apiClient from '../../api/apiClient';

interface ServerLimitsResponse {
  currentTier: number;
  tierName?: string;
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  nextTier?: number;
  nextTierLimit?: number;
  currencySymbol?: string;
}

interface DynamicTransactionLimitsCardProps {
  onUpgradePress: () => void;
}

export const DynamicTransactionLimitsCard: React.FC<DynamicTransactionLimitsCardProps> = ({
  onUpgradePress,
}) => {
  const [loading, setLoading] = useState(true);
  const [limitsData, setLimitsData] = useState<ServerLimitsResponse | null>(null);

  const fetchServerLimits = async () => {
    try {
      setLoading(true);
      const res = await apiClient.get('/wallet/limits');
      if (res.data) {
        setLimitsData({
          currentTier: res.data.currentTier ?? res.data.tier ?? 1,
          tierName: res.data.tierName || `Tier ${res.data.currentTier || 1}`,
          dailyLimit: Number(res.data.dailyLimit || res.data.maxDaily || 100),
          usedToday: Number(res.data.usedToday || res.data.spentToday || 0),
          remainingToday: Number(res.data.remainingToday || res.data.remaining || 100),
          nextTier: res.data.nextTier || ((res.data.currentTier || 1) < 3 ? (res.data.currentTier || 1) + 1 : undefined),
          nextTierLimit: res.data.nextTierLimit,
          currencySymbol: res.data.currencySymbol || '$',
        });
      }
    } catch (err) {
      console.warn('[DynamicLimitsCard] Error fetching server limits:', err);
      // Non-destructive fallback shape with 0 values if server query fails
      setLimitsData({
        currentTier: 1,
        dailyLimit: 100,
        usedToday: 0,
        remainingToday: 100,
        currencySymbol: '$',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchServerLimits();
  }, []);

  if (loading) {
    return (
      <View style={styles.cardContainer}>
        <ActivityIndicator size="small" color="#3B82F6" />
        <Text style={styles.loadingText}>Loading dynamic transaction limits...</Text>
      </View>
    );
  }

  const sym = limitsData?.currencySymbol || '$';
  const limit = limitsData?.dailyLimit || 0;
  const used = limitsData?.usedToday || 0;
  const remaining = limitsData?.remainingToday || 0;
  const progressPercent = Math.min(100, Math.max(0, limit > 0 ? (used / limit) * 100 : 0));

  return (
    <View style={styles.cardContainer}>
      {/* Card Header */}
      <View style={styles.cardHeader}>
        <View style={styles.headerTitleRow}>
          <ShieldCheckIcon size={20} color="#60A5FA" />
          <Text style={styles.cardTitle}>Dynamic Transaction Limits</Text>
        </View>
        <TouchableOpacity style={styles.refreshBtn} onPress={fetchServerLimits}>
          <RefreshCwIcon size={14} color="#94A3B8" />
        </TouchableOpacity>
      </View>

      {/* Usage Meter Box */}
      <View style={styles.meterBox}>
        <View style={styles.meterLabels}>
          <Text style={styles.meterTextLeft}>
            Spent Today: <Text style={styles.highlightText}>{sym}{used.toLocaleString()}</Text>
          </Text>
          <Text style={styles.meterTextRight}>
            Limit: <Text style={styles.highlightText}>{sym}{limit.toLocaleString()}</Text>
          </Text>
        </View>

        {/* Progress Bar Track */}
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPercent}%` }]} />
        </View>

        <View style={styles.remainingRow}>
          <ZapIcon size={14} color="#10B981" />
          <Text style={styles.remainingText}>
            Remaining Allowance Today: <Text style={styles.remainingAmount}>{sym}{remaining.toLocaleString()}</Text>
          </Text>
        </View>
      </View>

      {/* Upgrade Call To Action */}
      {limitsData?.nextTier && (
        <TouchableOpacity style={styles.upgradeBtn} onPress={onUpgradePress}>
          <View style={styles.upgradeLeft}>
            <TrendingUpIcon size={18} color="#FFFFFF" />
            <Text style={styles.upgradeBtnText}>Upgrade to Tier {limitsData.nextTier} for Higher Limits</Text>
          </View>
          <ArrowRightIcon size={18} color="#FFFFFF" />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    backgroundColor: '#1E293B',
    borderRadius: 20,
    padding: 18,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  refreshBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  meterBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    padding: 14,
    borderRadius: 14,
    marginBottom: 14,
  },
  meterLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  meterTextLeft: {
    fontSize: 12,
    color: '#94A3B8',
  },
  meterTextRight: {
    fontSize: 12,
    color: '#94A3B8',
  },
  highlightText: {
    fontWeight: '700',
    color: '#E2E8F0',
  },
  progressTrack: {
    height: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  remainingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  remainingText: {
    fontSize: 12,
    color: '#94A3B8',
  },
  remainingAmount: {
    fontWeight: '700',
    color: '#34D399',
  },
  upgradeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#3B82F6',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
  },
  upgradeLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  upgradeBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  loadingText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
  },
});
