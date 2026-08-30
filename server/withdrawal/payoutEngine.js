/**
 * Sovereign Enterprise Payout Engine
 * ───────────────────────────────────
 * Orchestrates the full 14-step withdrawal sequence with atomic database state,
 * distributed locks, Global Correlation IDs, OTP Challenge detection, and provider failover.
 */

const { v4: uuidv4 }        = require("uuid");
const supabase               = require("../config/database");
const { registry }           = require("../providers/PayoutProvider");
const FincraProvider         = require("../providers/fincraProvider");
const { acquireWithdrawalLock } = require("./redisLock");
const { WITHDRAWAL_STATES, assertTransition } = require("./stateMachine");
const { recordAuditLog }     = require("./auditLogger");
const logger                 = require("../utils/logger");
const complianceGate         = require("./complianceGate");

// Ensure FincraProvider is registered
registry.register(new FincraProvider());

class PayoutEngine {
  /**
   * Process an enterprise withdrawal request.
   *
   * @param {object} params
   * @param {string} params.userId
   * @param {number} params.amount
   * @param {string} params.currency        - NGN | USD | EUR
   * @param {string} params.bankCode
   * @param {string} params.accountNumber
   * @param {string} params.accountName     - Resolved beneficiary name
   * @param {string} [params.narration]
   * @param {string} [params.idempotencyKey]
   * @param {string} [params.correlationId]
   * @param {string} [params.ip]
   * @param {string} [params.deviceId]
   * @param {string} [params.userAgent]
   */
  async processWithdrawal({
    userId,
    amount,
    currency = "NGN",
    bankCode,
    accountNumber,
    accountName,
    userEmail,
    narration,
    idempotencyKey,
    correlationId,
    ip = "0.0.0.0",
    deviceId = "unknown",
    userAgent = "unknown",
  }) {
    const correlation_id   = correlationId || `corr_${uuidv4()}`;
    const idempotency_key  = idempotencyKey  || `idemp_${uuidv4()}`;
    const trace_id         = `trc_${uuidv4()}`;
    const withdrawal_ref   = `FIN_PAYOUT_${uuidv4().replace(/-/g, "").substring(0, 16)}`;
    const wallet_ref       = `WAL_${uuidv4().replace(/-/g, "").substring(0, 16)}`;
    const ledger_ref       = `LDG_${uuidv4().replace(/-/g, "").substring(0, 16)}`;

    console.log(`[E2E_CORRELATION_TRACE] [${correlation_id}] [Stage 3/10] payoutEngine.processWithdrawal Entry | Ref: ${withdrawal_ref}, Amount: ${amount} ${currency}`);

    // ── STEP 1: Acquire Distributed Lock (withdraw:user:UUID) ─────────────
    const { release } = await acquireWithdrawalLock(userId, 3000);

    try {
      // ── STEP 2: State Machine Check (CREATED -> VALIDATED) ─────────────────
      assertTransition(WITHDRAWAL_STATES.CREATED, WITHDRAWAL_STATES.VALIDATED);

      // ── STEP 2.5: Server-Side Pre-Execution Compliance Gate ───────────────
      const complianceRes = await complianceGate.evaluatePayout({
        userId,
        amount,
        currency,
        ipAddress: ip,
        correlationId: correlation_id,
      });

      if (!complianceRes.allowed) {
        throw new Error(`${complianceRes.errorCode}: ${complianceRes.reason}`);
      }

      // Mask Account Number for Audit & Security
      const accountNumberMasked = accountNumber.length > 4 
        ? `${accountNumber.substring(0, 2)}****${accountNumber.substring(accountNumber.length - 2)}`
        : "****";

      // Calculate Fee (Fixed NGN 50 flat fee or server rule)
      const fee = 50.00;
      const riskScore = complianceRes.riskScore || 0;
      const riskRoute = complianceRes.status === "MANUAL_REVIEW" || complianceRes.isHold ? "MANUAL_REVIEW" : "AUTO";

      // ── STEP 3: Check Merchant Balance Pre-Check & Treasury Routing ─────────
      const requestedProviderName = params.provider || params.requestedProvider || null;
      let provider;
      if (requestedProviderName) {
        try {
          provider = registry.get(requestedProviderName);
        } catch {
          provider = registry.getPrimary();
        }
      } else {
        provider = registry.getPrimary();
      }

      const isTreasuryCrossCurrencyEnabled = process.env.TREASURY_CROSS_CURRENCY_WITHDRAWALS_ENABLED === "true";

      let merchantBal = await provider.getMerchantBalance(currency);
      if (merchantBal.available < amount) {
        logger.warn(`[PayoutEngine] [${correlation_id}] Merchant balance on '${provider.name}' insufficient (${merchantBal.available} < ${amount} ${currency})`);

        // Check alternate payout provider (Fincra ↔ Anchor)
        const altProviderName = (provider.name === 'fincra') ? 'anchor' : (provider.name === 'anchor' ? 'fincra' : null);
        if (altProviderName) {
          try {
            const altProvider = registry.get(altProviderName);
            const altBal = await altProvider.getMerchantBalance(currency);
            if (altBal.available >= amount) {
              logger.info(`[PayoutEngine] [${correlation_id}] Dynamic payout failover: switching provider from '${provider.name}' to '${altProviderName}' (available: ${altBal.available})`);
              provider = altProvider;
              merchantBal = altBal;
            }
          } catch (altErr) {
            logger.warn(`[PayoutEngine] Failover check to '${altProviderName}' failed: ${altErr.message}`);
          }
        }
      }

      if (merchantBal.available < amount) {
        logger.warn(`[PayoutEngine] [${correlation_id}] All provider merchant balances insufficient (${merchantBal.available} < ${amount} ${currency})`);

        if (!isTreasuryCrossCurrencyEnabled) {
          throw new Error("MERCHANT_RESERVE_MAINTENANCE: Merchant payout reserves are currently undergoing top-up. Please try again shortly.");
        }

        // Feature flag enabled: Invoke Treasury Liquidity Router
        assertTransition(WITHDRAWAL_STATES.VALIDATED, WITHDRAWAL_STATES.TREASURY_CHECK);
        const TreasuryLiquidityRouter = require("../services/treasury/TreasuryLiquidityRouter");
        const TreasuryReservationService = require("../services/treasury/TreasuryReservationService");
        const TreasuryConversionService = require("../services/treasury/TreasuryConversionService");
        const { acquireCorporateTreasuryLock } = require("./redisLock");

        const fundingDecision = await TreasuryLiquidityRouter.findFundingRoute({
          destinationCurrency: currency,
          destinationAmount: amount,
          provider,
          withdrawalReference: withdrawal_ref
        });

        if (!fundingDecision.fundingRequired || !fundingDecision.eligible) {
          assertTransition(WITHDRAWAL_STATES.TREASURY_CHECK, WITHDRAWAL_STATES.TREASURY_INSUFFICIENT);
          throw new Error(`TREASURY_INSUFFICIENT: ${fundingDecision.reason || 'Insufficient corporate treasury liquidity across all eligible source currencies.'}`);
        }

        assertTransition(WITHDRAWAL_STATES.TREASURY_CHECK, WITHDRAWAL_STATES.TREASURY_FUNDING_REQUIRED);

        // Acquire Corporate Treasury Lock for selected source -> destination pair
        const { release: releaseTreasuryLock } = await acquireCorporateTreasuryLock(
          provider.name || "fincra",
          fundingDecision.sourceCurrency,
          fundingDecision.destinationCurrency,
          30000
        );

        try {
          // Reserve Corporate Treasury Liquidity in DB
          const reservation = await TreasuryReservationService.createReservation({
            withdrawalReference: withdrawal_ref,
            provider: provider.name || "fincra",
            sourceCurrency: fundingDecision.sourceCurrency,
            sourceAmount: fundingDecision.sourceAmount,
            destinationCurrency: fundingDecision.destinationCurrency,
            destinationAmount: fundingDecision.destinationAmount,
            fxRate: fundingDecision.fxRate,
            providerFee: fundingDecision.providerFee,
            spreadAmount: fundingDecision.spreadAmount,
            ttlSeconds: 300
          });

          assertTransition(WITHDRAWAL_STATES.TREASURY_FUNDING_REQUIRED, WITHDRAWAL_STATES.TREASURY_SOURCE_RESERVED);

          // Execute Corporate FX Conversion & Confirm Destination Liquidity
          await TreasuryConversionService.executeConversion({
            provider,
            fundingDecision,
            treasuryReference: reservation.treasuryReference,
            withdrawalReference: withdrawal_ref
          });

          assertTransition(WITHDRAWAL_STATES.TREASURY_SOURCE_RESERVED, WITHDRAWAL_STATES.PAYOUT_FUNDS_CONFIRMED);
        } finally {
          await releaseTreasuryLock();
        }
      }

      // ── STEP 3.5: Auto-Reconcile Stale Reserved Transactions ────────────────
      try {
        const { data: staleTxs } = await supabase
          .from("fincra_transactions")
          .select("reference, withdrawal_reference")
          .eq("user_id", userId)
          .eq("status", "RESERVED")
          .lt("created_at", new Date(Date.now() - 2 * 60 * 1000).toISOString());

        if (staleTxs && staleTxs.length > 0) {
          for (const staleTx of staleTxs) {
            const refToReverse = staleTx.withdrawal_reference || staleTx.reference;
            logger.info(`[PayoutEngine] Auto-reversing stale reserved transaction: ${refToReverse}`);
            await supabase.rpc("finalize_enterprise_withdrawal", {
              p_withdrawal_ref: refToReverse,
              p_fincra_ref:     null,
              p_status:         "REVERSED",
              p_error_code:     "STALE_RESERVATION_TIMEOUT",
              p_error_message:  "Transaction reserved timeout; funds automatically restored to wallet balance.",
            });
          }
        }
      } catch (staleErr) {
        logger.warn(`[PayoutEngine] Non-critical error checking stale reserved transactions: ${staleErr.message}`);
      }

      // ── STEP 4: Atomic DB RPC Execution (SELECT ... FOR UPDATE) ───────────
      assertTransition(WITHDRAWAL_STATES.VALIDATED, WITHDRAWAL_STATES.RESERVED);

      const { data: rpcRes, error: rpcErr } = await supabase.rpc("execute_enterprise_withdrawal", {
        p_user_id:             userId,
        p_currency:            currency.toUpperCase(),
        p_amount:              parseFloat(amount),
        p_fee:                 fee,
        p_withdrawal_ref:      withdrawal_ref,
        p_wallet_ref:          wallet_ref,
        p_ledger_ref:          ledger_ref,
        p_idempotency_key:     idempotency_key,
        p_trace_id:            trace_id,
        p_correlation_id:      correlation_id,
        p_bank_code:           bankCode,
        p_account_number_mask: accountNumberMasked,
        p_account_name:        accountName,
        p_narration:           narration || "NoteStandard withdrawal",
        p_ip_address:          ip,
        p_device_id:           deviceId,
        p_user_agent:          userAgent,
        p_risk_score:          riskScore,
        p_risk_route:          riskRoute,
        p_provider_name:       provider.name,
      });

      console.log(`[E2E_CORRELATION_TRACE] [${correlation_id}] [Stage 9/10] RPC execute_enterprise_withdrawal Result:`, JSON.stringify({ rpcRes, rpcErr }, null, 2));

      if (rpcErr || !rpcRes?.success) {
        const errCode = rpcRes?.error_code || "RPC_ERROR";
        const errMsg  = rpcRes?.message || rpcErr?.message || "Database transaction failed";
        logger.error(`[PayoutEngine] [${correlation_id}] RPC failed: ${errMsg}`);
        throw new Error(`${errCode}: ${errMsg}`);
      }

      if (rpcRes.is_duplicate) {
        logger.info(`[PayoutEngine] [${correlation_id}] Idempotency key match found. Returning existing reference ${rpcRes.reference}`);
        return {
          success:              true,
          isDuplicate:          true,
          withdrawal_reference: rpcRes.reference,
          status:               rpcRes.status,
          correlation_id,
        };
      }

      await recordAuditLog({
        action:  "WITHDRAWAL_RESERVED",
        userId,
        details: { withdrawal_ref, correlation_id, amount, currency, trace_id },
      });

      // If routed to MANUAL_REVIEW, return early without calling provider
      if (riskRoute === "MANUAL_REVIEW") {
        return {
          success:              true,
          withdrawal_reference: withdrawal_ref,
          status:               WITHDRAWAL_STATES.MANUAL_REVIEW,
          message:              "Withdrawal requires manual risk approval.",
          correlation_id,
          trace_id,
        };
      }

      // ── STEP 5: State Machine Transition & Provider Call ───────────────────
      assertTransition(WITHDRAWAL_STATES.RESERVED, WITHDRAWAL_STATES.SENT_TO_PROVIDER);

      try {
        const providerRes = await provider.initiatePayout({
          amount:        parseFloat(amount),
          currency:      currency.toUpperCase(),
          bankCode,
          accountNumber,
          accountName,
          userEmail,
          narration,
          reference:     withdrawal_ref,
        });

        console.log("[RUNTIME_TRACE] 1. Fincra Provider Raw Response (providerRes):", JSON.stringify(providerRes, null, 2));

        // ── OTP Challenge Detection ───────────────────────────────────────────
        if (providerRes.otpRequired || providerRes.status === "OTP_REQUIRED") {
          logger.info(`[PayoutEngine] [${correlation_id}] Fincra requested OTP challenge for reference ${withdrawal_ref}`);

          await supabase
            .from("fincra_transactions")
            .update({
              status:           "OTP_REQUIRED",
              fincra_reference: providerRes.fincraReference,
            })
            .eq("reference", withdrawal_ref);

          await recordAuditLog({
            action:  "PAYOUT_OTP_CHALLENGE_ISSUED",
            userId,
            details: { withdrawal_ref, fincra_ref: providerRes.fincraReference, correlation_id },
          });

          return {
            success:              true,
            status:               "OTP_REQUIRED",
            otpRequired:          true,
            withdrawal_reference: withdrawal_ref,
            fincra_reference:     providerRes.fincraReference,
            trace_id,
            correlation_id,
            message:              "Fincra OTP verification required to complete withdrawal.",
            details: {
              amount:              parseFloat(amount),
              currency:            currency.toUpperCase(),
              accountName,
              accountNumberMasked,
              bankCode,
            },
          };
        }

        assertTransition(WITHDRAWAL_STATES.SENT_TO_PROVIDER, WITHDRAWAL_STATES.PROCESSING);

        await supabase
          .from("fincra_transactions")
          .update({
            status:           WITHDRAWAL_STATES.PROCESSING,
            fincra_reference: providerRes.fincraReference,
          })
          .eq("reference", withdrawal_ref);

        await recordAuditLog({
          action:  "PAYOUT_SUBMITTED_TO_PROVIDER",
          userId,
          details: { withdrawal_ref, fincra_ref: providerRes.fincraReference, correlation_id },
        });

        return {
          success:              true,
          withdrawal_reference: withdrawal_ref,
          fincra_reference:     providerRes.fincraReference,
          status:               WITHDRAWAL_STATES.PROCESSING,
          correlation_id,
          trace_id,
        };
      } catch (providerErr) {
        // ── STEP 5 FAILURE: Revert fund reservation idempotently ─
        logger.error(`[PayoutEngine] [${correlation_id}] Provider call error. Triggering auto-reversal: ${providerErr.message}`);

        const IdempotentWithdrawalSettlementService = require("../services/payment/IdempotentWithdrawalSettlementService");
        await IdempotentWithdrawalSettlementService.reverseReservation({
          reference: withdrawal_ref,
          userId,
          currency,
          amount,
          fee,
          reason: providerErr.message,
          errorCode: "PROVIDER_ERROR",
          source: "PAYOUT_ENGINE_AUTO_REVERSAL",
        }).catch(revErr => logger.error(`[PayoutEngine] Reversal error: ${revErr.message}`));

        throw providerErr;
      }
    } finally {
      await release();
    }
  }

  /**
   * Verify OTP submitted by user for a payout challenge.
   */
  async verifyOtp({ userId, withdrawalReference, fincraReference, otp, traceId, correlationId }) {
    const correlation_id = correlationId || `corr_${uuidv4()}`;

    logger.info(`[PayoutEngine] [${correlation_id}] Verifying payout OTP for ref: ${withdrawalReference}`);

    const { data: tx, error } = await supabase
      .from("fincra_transactions")
      .select("*")
      .or(`reference.eq.${withdrawalReference},withdrawal_reference.eq.${withdrawalReference}`)
      .single();

    if (error || !tx) {
      throw new Error("TRANSACTION_NOT_FOUND: Withdrawal reference not found.");
    }

    if (tx.status === "SUCCESSFUL" || tx.status === "PROCESSING") {
      return {
        success:              true,
        status:               tx.status,
        withdrawal_reference: tx.reference,
        fincra_reference:     tx.fincra_reference,
        message:              "Withdrawal already verified and processing.",
      };
    }

    const provider = registry.getPrimary();

    try {
      const res = await provider.verifyOtp({
        fincraReference: fincraReference || tx.fincra_reference,
        otp,
        withdrawalReference,
      });

      const nextStatus = res.status === "SUCCESSFUL" ? "SUCCESSFUL" : "PROCESSING";

      await supabase
        .from("fincra_transactions")
        .update({
          status:     nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tx.id);

      await recordAuditLog({
        action:  "PAYOUT_OTP_VERIFIED",
        userId,
        details: { withdrawalReference, fincraReference, nextStatus, correlation_id },
      });

      const { emitWithdrawalEvent, EVENTS } = require("../realtime/withdrawalEvents");
      const { publishWithdrawalNotification } = require("./notificationPublisher");

      await emitWithdrawalEvent(userId, EVENTS.WITHDRAWAL_SETTLED, {
        reference: tx.reference,
        amount:    tx.amount,
        currency:  tx.currency,
        status:    nextStatus,
      });

      await publishWithdrawalNotification({
        userId,
        type:      "PENDING",
        amount:    tx.amount,
        currency:  tx.currency,
        reference: tx.reference,
      });

      return {
        success:              true,
        status:               nextStatus,
        withdrawal_reference: tx.reference,
        fincra_reference:     tx.fincra_reference,
        trace_id:             tx.trace_id,
        message:              "OTP verified successfully. Withdrawal is processing.",
      };
    } catch (err) {
      logger.error(`[PayoutEngine] [${correlation_id}] OTP verification failed for ${withdrawalReference}: ${err.message}`);

      await recordAuditLog({
        action:  "PAYOUT_OTP_VERIFICATION_FAILED",
        userId,
        details: { withdrawalReference, fincraReference, error: err.message, correlation_id },
      });

      throw err;
    }
  }

  /**
   * Resend OTP challenge to user.
   */
  async resendOtp({ userId, withdrawalReference, fincraReference }) {
    const provider = registry.getPrimary();
    const res = await provider.resendOtp({ fincraReference, withdrawalReference });
    await recordAuditLog({
      action:  "PAYOUT_OTP_RESENT",
      userId,
      details: { withdrawalReference, fincraReference },
    });
    return res;
  }
}

module.exports = new PayoutEngine();
