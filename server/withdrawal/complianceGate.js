/**
 * Sovereign Compliance & Risk Gate
 * ─────────────────────────────────
 * Centralized pre-execution compliance evaluation for NoteStandard Fincra payouts & conversions.
 * Evaluates KYC verification, account restriction status, daily transaction limits, and fraud risk.
 *
 * ABSOLUTE INVARIANT:
 * Zero financial mutations (wallet debit, ledger entry, provider dispatch) may occur if a check fails.
 */

'use strict';

const supabase         = require("../config/database");
const logger           = require("../utils/logger");
const FraudRiskEngine  = require("../services/risk/FraudRiskEngine");
const { recordAuditLog } = require("./auditLogger");
const userComplianceLocks = new Map();

async function withUserLock(userId, fn) {
  let lock = userComplianceLocks.get(userId);
  if (!lock) {
    lock = Promise.resolve();
  }
  let resolveLock;
  const nextLock = new Promise((res) => { resolveLock = res; });
  userComplianceLocks.set(userId, nextLock);

  try {
    await lock;
    return await fn();
  } finally {
    resolveLock();
    if (userComplianceLocks.get(userId) === nextLock) {
      userComplianceLocks.delete(userId);
    }
  }
}

class ComplianceGate {
  /**
   * Evaluate a Fincra payout request before execution.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {number} params.amount
   * @param {string} params.currency
   * @param {string} [params.ipAddress]
   * @param {string} [params.correlationId]
   * @returns {Promise<{ allowed: boolean, status: string, isHold?: boolean, errorCode?: string, reason?: string, riskScore?: number }>}
   */
  async evaluatePayout({ userId, amount, currency, ipAddress = "0.0.0.0", correlationId }) {
    if (!userId || !amount) {
      return {
        allowed: false,
        errorCode: "INVALID_PARAMETERS",
        reason: "userId and amount are required for compliance evaluation.",
      };
    }

    const numAmount = parseFloat(amount);
    const upCurrency = String(currency || "NGN").toUpperCase();

    // ── 1. Fetch User Profile ───────────────────────────────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, email, is_verified, kyc_level, status, plan_tier, daily_withdrawal_limit")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      logger.error(`[ComplianceGate] Profile fetch failed for user ${userId}: ${profileErr?.message}`);
      return {
        allowed: false,
        errorCode: "PROFILE_NOT_FOUND",
        reason: "User profile not found for compliance evaluation.",
      };
    }

    // ── 2. Account Restriction Check ───────────────────────────────────────
    const restrictedStatuses = ["suspended", "frozen", "blocked", "restricted"];
    const currentStatus = String(profile.status || "").toLowerCase();

    if (restrictedStatuses.includes(currentStatus)) {
      logger.warn(`[ComplianceGate] Blocked payout for restricted user ${userId} (status: ${profile.status})`);
      await recordAuditLog({
        action: "PAYOUT_COMPLIANCE_REJECTED",
        userId,
        details: { correlationId, reason: "ACCOUNT_RESTRICTED", status: profile.status, amount, currency: upCurrency },
      }).catch(() => {});

      return {
        allowed: false,
        errorCode: "ACCOUNT_RESTRICTED",
        reason: `Account is currently ${currentStatus || "restricted"} from financial transactions.`,
      };
    }

    // ── 3. KYC Verification Check ──────────────────────────────────────────
    const isKycVerified =
      profile.is_verified === true ||
      (profile.kyc_level !== null && profile.kyc_level !== undefined && profile.kyc_level >= 1);

    if (!isKycVerified) {
      logger.warn(`[ComplianceGate] Blocked payout for unverified user ${userId} (kyc_level: ${profile.kyc_level}, is_verified: ${profile.is_verified})`);
      await recordAuditLog({
        action: "PAYOUT_COMPLIANCE_REJECTED",
        userId,
        details: { correlationId, reason: "VERIFICATION_REQUIRED", amount, currency: upCurrency },
      }).catch(() => {});

      return {
        allowed: false,
        errorCode: "VERIFICATION_REQUIRED",
        reason: "Account identity verification (KYC) is required before executing Fincra payouts.",
      };
    }

    // ── 4. Unified Cross-Rail Daily Withdrawal Limit Enforcement (Normalized to USD) ──────
    let dailyLimitUsd;
    if (profile.daily_withdrawal_limit !== null && profile.daily_withdrawal_limit !== undefined) {
      dailyLimitUsd = parseFloat(profile.daily_withdrawal_limit);
    } else {
      const tierWithdrawalLimits = { 0: 0, 1: 200, 2: 2500, 3: 25000 };
      const kycTierLimit = tierWithdrawalLimits[profile.kyc_level || 0] ?? 0;

      const { data: limitSetting } = await supabase
        .from("admin_settings")
        .select("value")
        .eq("key", "daily_limits")
        .single();

      const limitsMap = limitSetting?.value || { FREE: 1000, PRO: 10000, BUSINESS: 50000 };
      const effectivePlan = String(profile.plan_tier || "FREE").toUpperCase();
      const planLimit = limitsMap[effectivePlan] || limitsMap.FREE || 1000;

      dailyLimitUsd = Math.max(kycTierLimit, planLimit);
    }

    const fxService = require("../services/fxService");
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // 4a. Fetch transactions across both Fincra and standard rails
    const { data: fincraTxs } = await supabase
      .from("fincra_transactions")
      .select("amount, currency, metadata")
      .eq("user_id", userId)
      .in("status", ["COMPLETED", "PROCESSING", "RESERVED"])
      .gte("created_at", twentyFourHoursAgo);

    const { data: standardTxs } = await supabase
      .from("transactions")
      .select("amount, currency, metadata")
      .eq("user_id", userId)
      .in("status", ["COMPLETED", "PROCESSING"])
      .in("type", ["WITHDRAWAL", "payout", "withdrawal"])
      .gte("created_at", twentyFourHoursAgo);

    const allTxs = [...(fincraTxs || []), ...(standardTxs || [])];
    let total24hUsdUsed = 0;
    const seenRefs = new Set();

    for (const tx of allTxs) {
      const ref = tx.reference_id || tx.reference || tx.metadata?.fincra_reference || tx.metadata?.transaction_reference || tx.id;
      if (ref) {
        if (seenRefs.has(ref)) continue;
        seenRefs.add(ref);
      }

      const rawAmt = parseFloat(tx.amount) || 0;
      const curr = (tx.currency || "USD").toUpperCase();
      if (rawAmt <= 0) continue;

      if (tx.metadata?.usd_amount) {
        total24hUsdUsed += parseFloat(tx.metadata.usd_amount) || 0;
      } else if (tx.metadata?.usdAmount) {
        total24hUsdUsed += parseFloat(tx.metadata.usdAmount) || 0;
      } else if (curr === "USD") {
        total24hUsdUsed += rawAmt;
      } else {
        try {
          const conv = await fxService.convert(rawAmt, curr, "USD", true);
          if (!conv || isNaN(conv.amount) || conv.amount <= 0) {
            throw new Error(`INVALID_FX_RESULT_${curr}`);
          }
          total24hUsdUsed += conv.amount;
        } catch (err) {
          const staticRates = { NGN: 1 / 1600, GHS: 1 / 15, EUR: 1.08, GBP: 1.27 };
          total24hUsdUsed += rawAmt * (staticRates[curr] || 1);
        }
      }
    }

    // 4b. Normalize current requested payout to USD equivalent
    let requestedUsdAmount = numAmount;
    if (upCurrency !== "USD") {
      try {
        const conv = await fxService.convert(numAmount, upCurrency, "USD", true);
        if (!conv || isNaN(conv.amount) || conv.amount <= 0) {
          throw new Error(`INVALID_FX_RESULT_${upCurrency}`);
        }
        requestedUsdAmount = conv.amount;
      } catch (err) {
        const staticRates = { NGN: 1 / 1600, GHS: 1 / 15, EUR: 1.08, GBP: 1.27 };
        requestedUsdAmount = numAmount * (staticRates[upCurrency] || 1);
      }
    }

    if (requestedUsdAmount + total24hUsdUsed > dailyLimitUsd) {
      logger.warn(`[ComplianceGate] Limit exceeded for user ${userId}: requested $${requestedUsdAmount.toFixed(2)} USD (${numAmount} ${upCurrency}), used 24h: $${total24hUsdUsed.toFixed(2)} USD, limit: $${dailyLimitUsd} USD`);
      await recordAuditLog({
        action: "PAYOUT_COMPLIANCE_REJECTED",
        userId,
        details: { correlationId, reason: "LIMIT_EXCEEDED", requestedUsd: requestedUsdAmount, used24hUsd: total24hUsdUsed, dailyLimitUsd },
      }).catch(() => {});

      return {
        allowed: false,
        errorCode: "LIMIT_EXCEEDED",
        reason: `Withdrawal amount (${numAmount} ${upCurrency} / $${requestedUsdAmount.toFixed(2)} USD) exceeds cumulative 24h daily limit of $${dailyLimitUsd} USD.`,
      };
    }

    // ── 5. Fraud Risk Engine Evaluation ───────────────────────────────────
    let riskResult;
    try {
      riskResult = await FraudRiskEngine.evaluate({
        userId,
        email: profile.email,
        amount: numAmount,
        currency: upCurrency,
        ipAddress,
        method: "fincra_payout",
      });
    } catch (riskErr) {
      logger.error(`[ComplianceGate] FraudRiskEngine evaluation failed: ${riskErr.message}`);
      return {
        allowed: false,
        errorCode: "RISK_ENGINE_ERROR",
        reason: "Fraud risk engine evaluation failed. Fail-closed protection active.",
      };
    }

    if (!riskResult.approved || riskResult.riskScore > 50) {
      logger.warn(`[ComplianceGate] High risk payout flagged for user ${userId} (Score: ${riskResult.riskScore}, Reason: ${riskResult.reason})`);
      await recordAuditLog({
        action: "PAYOUT_RISK_HOLD",
        userId,
        details: { correlationId, riskScore: riskResult.riskScore, reason: riskResult.reason },
      }).catch(() => {});

      return {
        allowed: true,
        status: "MANUAL_REVIEW",
        isHold: true,
        riskScore: riskResult.riskScore,
        reason: `Withdrawal held for compliance review (Risk score: ${riskResult.riskScore}).`,
      };
    }

    return {
      allowed: true,
      status: "APPROVED",
      isHold: false,
      riskScore: riskResult.riskScore,
    };
  }

  /**
   * Evaluate a Fincra conversion request before execution.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {number} params.amount
   * @param {string} params.currency
   * @param {string} [params.ipAddress]
   * @returns {Promise<{ allowed: boolean, status?: string, isHold?: boolean, errorCode?: string, reason?: string, riskScore?: number }>}
   */
  async evaluateConversion({ userId, amount, currency, ipAddress = "0.0.0.0" }) {
    return await withUserLock(userId, async () => {
      if (!userId || !amount) {
        return {
          allowed: false,
          errorCode: "INVALID_PARAMETERS",
          reason: "userId and amount are required for compliance evaluation.",
        };
      }

      const numAmount = parseFloat(amount);
      const upCurrency = String(currency || "USDT").toUpperCase();


    // ── 1. Fetch Profile ────────────────────────────────────────────────────
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, email, is_verified, kyc_level, status, plan_tier, daily_withdrawal_limit")
      .eq("id", userId)
      .single();

    if (profileErr || !profile) {
      return {
        allowed: false,
        errorCode: "PROFILE_NOT_FOUND",
        reason: "User profile not found for compliance evaluation.",
      };
    }

    // ── 2. Account Restriction Check ───────────────────────────────────────
    const restrictedStatuses = ["suspended", "frozen", "blocked", "restricted"];
    const currentStatus = String(profile.status || "").toLowerCase();
    if (restrictedStatuses.includes(currentStatus)) {
      await recordAuditLog({
        action: "CONVERSION_COMPLIANCE_REJECTED",
        userId,
        details: { reason: "ACCOUNT_RESTRICTED", status: profile.status, amount: numAmount, currency: upCurrency },
      }).catch(() => {});

      return {
        allowed: false,
        errorCode: "ACCOUNT_RESTRICTED",
        reason: `Account is currently ${currentStatus || "restricted"} from financial transactions.`,
      };
    }

    // ── 3. KYC Verification Check ──────────────────────────────────────────
    const isKycVerified =
      profile.is_verified === true ||
      (profile.kyc_level !== null && profile.kyc_level !== undefined && profile.kyc_level >= 1);

    if (!isKycVerified) {
      await recordAuditLog({
        action: "CONVERSION_COMPLIANCE_REJECTED",
        userId,
        details: { reason: "VERIFICATION_REQUIRED", amount: numAmount, currency: upCurrency },
      }).catch(() => {});

      return {
        allowed: false,
        errorCode: "VERIFICATION_REQUIRED",
        reason: "Account identity verification (KYC) is required before executing Fincra conversions.",
      };
    }

    // ── 4. Daily Cumulative Conversion Limit Check (Normalized to USD) ─────────────────
    let dailyLimitUsd = 10000; // Default daily conversion limit USD equivalent
    if (profile.daily_withdrawal_limit) {
      dailyLimitUsd = parseFloat(profile.daily_withdrawal_limit);
    }

    const fxService = require("../services/fxService");
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: convTxs } = await supabase
      .from("fincra_transactions")
      .select("amount, currency, metadata")
      .eq("user_id", userId)
      .in("type", ["conversion", "CONVERSION"])
      .in("status", ["PROCESSING", "CONVERSION_PROCESSING", "CONVERSION_SUCCESSFUL", "NGN_SETTLED", "OTC_FUNDING_PENDING", "FINCRA_BALANCE_CONFIRMED", "QUOTE_RECEIVED", "CONVERSION_SUBMITTED", "PENDING", "SUCCESSFUL"])
      .gte("created_at", twentyFourHoursAgo);

    let total24hUsdUsed = 0;
    const seenConvRefs = new Set();
    if (convTxs && convTxs.length > 0) {
      for (const tx of convTxs) {
        const ref = tx.reference || tx.reference_id || tx.metadata?.fincra_reference || tx.metadata?.idempotencyKey || tx.id;
        if (ref) {
          if (seenConvRefs.has(ref)) continue;
          seenConvRefs.add(ref);
        }

        const rawAmt = parseFloat(tx.amount) || 0;
        const curr = (tx.currency || "USDT").toUpperCase();
        if (rawAmt <= 0) continue;

        if (tx.metadata?.usd_amount) {
          total24hUsdUsed += parseFloat(tx.metadata.usd_amount) || 0;
        } else if (tx.metadata?.usdAmount) {
          total24hUsdUsed += parseFloat(tx.metadata.usdAmount) || 0;
        } else if (curr === "USD" || curr === "USDT" || curr === "USDC") {
          total24hUsdUsed += rawAmt;
        } else {
          try {
            const conv = await fxService.convert(rawAmt, curr, "USD", true);
            if (!conv || isNaN(conv.amount) || conv.amount <= 0) {
              throw new Error(`INVALID_FX_RESULT_${curr}`);
            }
            total24hUsdUsed += conv.amount;
          } catch (err) {
            const staticRates = { NGN: 1 / 1600, GHS: 1 / 15, EUR: 1.08, GBP: 1.27 };
            total24hUsdUsed += rawAmt * (staticRates[curr] || 1);
          }
        }
      }
    }

    let requestedUsdAmount = numAmount;
    if (upCurrency !== "USD" && upCurrency !== "USDT" && upCurrency !== "USDC") {
      try {
        const conv = await fxService.convert(numAmount, upCurrency, "USD", true);
        if (!conv || isNaN(conv.amount) || conv.amount <= 0) {
          throw new Error(`INVALID_FX_RESULT_${upCurrency}`);
        }
        requestedUsdAmount = conv.amount;
      } catch (err) {
        const staticRates = { NGN: 1 / 1600, GHS: 1 / 15, EUR: 1.08, GBP: 1.27 };
        requestedUsdAmount = numAmount * (staticRates[upCurrency] || 1);
      }
    }

    if (requestedUsdAmount + total24hUsdUsed > dailyLimitUsd) {
      logger.warn(`[ComplianceGate] Conversion limit exceeded for user ${userId}: requested $${requestedUsdAmount.toFixed(2)} USD (${numAmount} ${upCurrency}), 24h used: $${total24hUsdUsed.toFixed(2)} USD, limit: $${dailyLimitUsd} USD`);
      await recordAuditLog({
        action: "CONVERSION_COMPLIANCE_REJECTED",
        userId,
        details: { reason: "LIMIT_EXCEEDED", requestedUsd: requestedUsdAmount, used24hUsd: total24hUsdUsed, dailyLimitUsd },
      }).catch(() => {});

      return {
        allowed: false,
        errorCode: "LIMIT_EXCEEDED",
        reason: `Conversion amount (${numAmount} ${upCurrency} / $${requestedUsdAmount.toFixed(2)} USD) exceeds cumulative 24h limit of $${dailyLimitUsd} USD.`,
      };
    }

    // ── 5. Fraud Risk Engine Evaluation ───────────────────────────────────
    let riskResult;
    try {
      riskResult = await FraudRiskEngine.evaluate({
        userId,
        email: profile.email,
        amount: numAmount,
        currency: upCurrency,
        ipAddress,
        method: "fincra_conversion",
      });
    } catch (riskErr) {
      logger.error(`[ComplianceGate] Conversion FraudRiskEngine error: ${riskErr.message}`);
      return {
        allowed: false,
        errorCode: "RISK_ENGINE_ERROR",
        reason: "Fraud risk engine evaluation failed. Fail-closed protection active.",
      };
    }

    if (!riskResult.approved || riskResult.riskScore > 50) {
      logger.warn(`[ComplianceGate] High risk conversion flagged for user ${userId} (Score: ${riskResult.riskScore})`);
      await recordAuditLog({
        action: "CONVERSION_RISK_HOLD",
        userId,
        details: { riskScore: riskResult.riskScore, reason: riskResult.reason },
      }).catch(() => {});

      return {
        allowed: true,
        status: "MANUAL_REVIEW",
        isHold: true,
        riskScore: riskResult.riskScore,
        reason: `Conversion held for manual compliance review (Risk score: ${riskResult.riskScore}).`,
      };
    }

    return {
      allowed: true,
      status: "APPROVED",
      isHold: false,
      riskScore: riskResult.riskScore,
    };
    });
  }
}

module.exports = new ComplianceGate();
