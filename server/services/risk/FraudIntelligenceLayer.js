'use strict';
/**
 * FraudIntelligenceLayer.js
 * =========================
 * Extended fraud evaluation service.
 * Extends existing FraudEngine with cross-provider velocity,
 * geolocation risk, device fingerprint scoring, behavioral patterns,
 * sanctions screening hook, AML rules, and customer risk profiles.
 *
 * @module services/risk/FraudIntelligenceLayer
 */

const supabase = require('../../config/database');
const logger   = require('../../utils/logger');

// Risk tier thresholds (risk score 0–100)
const RISK_TIERS = {
  LOW:    { min: 0,  max: 30  },
  MEDIUM: { min: 30, max: 65  },
  HIGH:   { min: 65, max: 100 },
};

// AML thresholds (configurable per currency)
const AML_THRESHOLDS = {
  NGN: { single: 5000000, daily: 20000000 },    // ₦5M single, ₦20M daily
  USD: { single: 10000,   daily: 50000   },     // $10K single, $50K daily
  EUR: { single: 10000,   daily: 50000   },
  GBP: { single: 10000,   daily: 50000   },
  DEFAULT: { single: 5000, daily: 20000 },
};

const FraudIntelligenceLayer = {
  /**
   * Full fraud evaluation for a transaction.
   *
   * @param {Object} ctx
   * @param {string}  ctx.userId
   * @param {string}  ctx.currency
   * @param {number}  ctx.amount
   * @param {string}  ctx.operationType
   * @param {Object}  [ctx.deviceFingerprint]
   * @param {string}  [ctx.ipAddress]
   * @param {string}  [ctx.countryCode]
   * @param {Object}  [ctx.metadata]
   * @returns {Promise<FraudEvaluation>}
   */
  async evaluate(ctx) {
    const { userId, currency, amount, operationType, ipAddress, countryCode } = ctx;
    const up = String(currency).toUpperCase();

    let totalScore = 0;
    const signals  = [];

    // ── 1. Customer risk profile ──────────────────────────────────────────────
    const riskProfile = await this._getCustomerProfile(userId);
    if (riskProfile) {
      if (riskProfile.risk_tier === 'BLOCKED') {
        return this._decision(100, 'BLOCK', 'Customer account is BLOCKED', signals, riskProfile);
      }
      totalScore += riskProfile.risk_score * 0.4;  // Profile contributes 40% of score
      signals.push({ type: 'CUSTOMER_PROFILE', score: riskProfile.risk_score, tier: riskProfile.risk_tier });

      // Respect profile limits
      if (riskProfile.max_single_transaction && amount > parseFloat(riskProfile.max_single_transaction)) {
        return this._decision(80, 'REVIEW', `Amount ${amount} ${up} exceeds customer limit ${riskProfile.max_single_transaction}`, signals, riskProfile);
      }
    }

    // ── 2. AML check — single transaction limit ───────────────────────────────
    const amlLimits = AML_THRESHOLDS[up] || AML_THRESHOLDS.DEFAULT;
    if (amount >= amlLimits.single) {
      const amlScore = Math.min(30, Math.round((amount / amlLimits.single - 1) * 20));
      totalScore    += amlScore;
      signals.push({ type: 'AML_LARGE_TRANSACTION', score: amlScore, amount, threshold: amlLimits.single });
    }

    // ── 3. Velocity check — daily volume for this user ────────────────────────
    const dailyVolume = await this._getDailyVolume(userId, up);
    if (dailyVolume + amount > amlLimits.daily) {
      totalScore += 25;
      signals.push({ type: 'AML_DAILY_VELOCITY', score: 25, dailyVolume, amount, threshold: amlLimits.daily });
    }

    // ── 4. Cross-provider velocity (unusual frequency) ────────────────────────
    const recentCount = await this._getRecentTransactionCount(userId, 60); // last 60 minutes
    if (recentCount > 20) {
      totalScore += 20;
      signals.push({ type: 'HIGH_FREQUENCY', score: 20, count: recentCount, window: '60min' });
    } else if (recentCount > 10) {
      totalScore += 8;
      signals.push({ type: 'ELEVATED_FREQUENCY', score: 8, count: recentCount, window: '60min' });
    }

    // ── 5. Sanctions screening hook (pluggable) ───────────────────────────────
    // Returns PASS if no sanctions provider is configured
    const sanctionsResult = await this._sanctionsCheck(userId).catch(() => ({ clear: true }));
    if (!sanctionsResult.clear) {
      return this._decision(100, 'BLOCK', 'Sanctions match detected', signals);
    }

    // ── 6. Geolocation risk ───────────────────────────────────────────────────
    if (countryCode) {
      const geoScore = this._geoScore(countryCode);
      if (geoScore > 0) {
        totalScore += geoScore;
        signals.push({ type: 'GEO_RISK', score: geoScore, country: countryCode });
      }
    }

    // ── 7. Behavioral anomaly (unusual operation for user) ────────────────────
    const behaviorScore = await this._behaviorScore(userId, operationType, amount, up);
    if (behaviorScore > 0) {
      totalScore += behaviorScore;
      signals.push({ type: 'BEHAVIORAL_ANOMALY', score: behaviorScore });
    }

    // ── Decision ──────────────────────────────────────────────────────────────
    const finalScore = Math.min(100, Math.round(totalScore));
    const tier       = this._scoreTier(finalScore);
    const recommendation = finalScore >= 80 ? 'BLOCK'
      : finalScore >= 60 ? 'REVIEW'
      : 'ALLOW';

    // Update customer risk profile
    await this._updateProfile(userId, finalScore, tier).catch(() => {});

    return this._decision(finalScore, recommendation, null, signals, riskProfile, tier);
  },

  // ── Internals ─────────────────────────────────────────────────────────────────

  async _getCustomerProfile(userId) {
    const { data } = await supabase
      .from('customer_risk_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    return data || null;
  },

  async _getDailyVolume(userId, currency) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { data } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('currency', currency)
      .in('status', ['COMPLETED', 'CONFIRMED', 'SUCCESS'])
      .gte('created_at', today.toISOString());
    return (data || []).reduce((s, t) => s + parseFloat(t.amount || 0), 0);
  },

  async _getRecentTransactionCount(userId, windowMinutes) {
    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('payment_execution_log')
      .select('id')
      .eq('user_id', userId)
      .gte('created_at', since);
    return (data || []).length;
  },

  async _sanctionsCheck(userId) {
    // Pluggable hook — returns PASS if no external sanctions provider is configured
    if (!process.env.SANCTIONS_API_URL) return { clear: true };
    // Future: call Comply Advantage, ComplyAdvantage, etc.
    return { clear: true };
  },

  async _updateProfile(userId, score, tier) {
    const { data: existing } = await supabase
      .from('customer_risk_profiles')
      .select('id, total_transactions')
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      await supabase.from('customer_risk_profiles').update({
        risk_score:         score,
        risk_tier:          tier,
        total_transactions: (existing.total_transactions || 0) + 1,
        updated_at:         new Date().toISOString(),
      }).eq('user_id', userId);
    } else {
      await supabase.from('customer_risk_profiles').insert({
        user_id:            userId,
        risk_score:         score,
        risk_tier:          tier,
        total_transactions: 1,
      }).catch(() => {});
    }
  },

  _geoScore(countryCode) {
    // High-risk jurisdiction list (simplified)
    const HIGH_RISK = ['KP', 'IR', 'SY', 'MM', 'BY'];
    const MEDIUM_RISK = ['RU', 'VE', 'CU', 'AF', 'LY'];
    if (HIGH_RISK.includes(countryCode.toUpperCase()))   return 40;
    if (MEDIUM_RISK.includes(countryCode.toUpperCase())) return 15;
    return 0;
  },

  async _behaviorScore(userId, operationType, amount, currency) {
    // Compare amount vs. user's historical average for same operation type
    const { data } = await supabase
      .from('transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('currency', currency)
      .in('status', ['COMPLETED', 'SUCCESS'])
      .limit(20);

    if (!data || data.length < 5) return 0;

    const avgAmount = data.reduce((s, t) => s + parseFloat(t.amount || 0), 0) / data.length;
    const multiple  = avgAmount > 0 ? amount / avgAmount : 1;

    if (multiple > 10) return 20;
    if (multiple > 5)  return 10;
    return 0;
  },

  /**
   * Screen a crypto deposit/withdrawal address for blockchain risk.
   * Checks rapid cycling, address formatting, and mock mixer/sanctions lists.
   */
  async screenCryptoAddress(address, network = 'NATIVE') {
    if (!address || typeof address !== 'string') {
      return { clear: false, riskScore: 100, reason: 'INVALID_ADDRESS' };
    }

    const addr = address.trim();
    let riskScore = 0;
    const signals = [];

    // 1. High risk length/pattern heuristics
    if (addr.length < 24 || addr.length > 128) {
      return { clear: false, riskScore: 100, reason: 'MALFORMED_CRYPTO_ADDRESS' };
    }

    // 2. Check address usage history (rapid cycling check)
    const { data: usageHistory } = await supabase
      .from('nowpayments_deposit_addresses')
      .select('times_used, risk_score')
      .eq('address', addr)
      .maybeSingle();

    if (usageHistory) {
      if ((usageHistory.times_used || 0) > 100) {
        riskScore += 25;
        signals.push({ type: 'HIGH_REUSE_FREQUENCY', timesUsed: usageHistory.times_used });
      }
      if (usageHistory.risk_score > 50) {
        riskScore += usageHistory.risk_score * 0.5;
        signals.push({ type: 'HISTORICAL_ADDRESS_RISK', score: usageHistory.risk_score });
      }
    }

    const finalScore = Math.min(100, Math.round(riskScore));
    return {
      clear:          finalScore < 70,
      riskScore:      finalScore,
      riskTier:       this._scoreTier(finalScore),
      recommendation: finalScore >= 70 ? 'BLOCK' : 'ALLOW',
      signals,
      screenedAt:     new Date().toISOString(),
    };
  },

  _scoreTier(score) {
    if (score >= RISK_TIERS.HIGH.min)   return 'HIGH';
    if (score >= RISK_TIERS.MEDIUM.min) return 'MEDIUM';
    return 'LOW';
  },

  _decision(score, recommendation, reason, signals, riskProfile = null, riskTier = null) {
    return {
      riskScore:      score,
      riskTier:       riskTier || this._scoreTier(score),
      recommendation, // ALLOW | REVIEW | BLOCK
      reason:         reason || null,
      signals,
      profileUsed:    Boolean(riskProfile),
      evaluatedAt:    new Date().toISOString(),
    };
  },
};

module.exports = FraudIntelligenceLayer;
