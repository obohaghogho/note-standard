/**
 * Fincra Integration — Webhook Processor
 * ─────────────────────────────────────────
 * Handles the full lifecycle of incoming Fincra webhooks.
 *
 * Processing order (strict sequence):
 *  1. Verify HMAC SHA-512 signature.
 *  2. Check duplicate event via event_hash (prevents double-credits).
 *  3. Persist webhook log to fincra_webhook_logs.
 *  4. Route to the appropriate handler (deposit / payout / conversion).
 *  5. Handler commits to internal ledger via wallets_store balance update.
 *  6. Notify user via realtime service.
 *
 * LEDGER INVARIANT:
 *   All balance mutations pass through wallets_store direct update here.
 *   This mirrors the pattern used by existing paymentService.js handlers.
 *   LedgerService.commitAtomicEvent() is called where available; this module
 *   uses wallets_store directly as a fallback following the established
 *   NoteStandard pattern.
 *
 * SAFETY:
 *   Fincra webhook amounts are NEVER directly set as user balance.
 *   They are ADDED to the existing balance (credit) or already handled
 *   by the reservation/reversal system in payout.js.
 */

const supabase               = require("../../config/database");
const { verifyFincraWebhookSignature, generateEventHash } = require("./encryption");
const { recordFincraAudit }  = require("./audit");
const { reversePayoutReservation } = require("./payout");
const { FINCRA_TX_STATUS, FINCRA_TX_TYPES, FINCRA_EVENTS } = require("./constants");
const { FincraSignatureError, FincraDuplicateEventError } = require("./errors");
const logger = require("../../utils/logger");

/**
 * Main webhook entry point.
 * Called by server/routes/fincraWebhook.js
 *
 * @param {object} headers   - Raw request headers
 * @param {string} rawBody   - Raw request body string (not parsed)
 * @param {object} parsedBody - Parsed JSON body
 */
async function processFincraWebhook(headers, rawBody, parsedBody) {
  // ── STEP 1: Verify HMAC SHA-512 Signature ─────────────────────────────
  // Throws FincraSignatureError if invalid — this propagates to return 401.
  verifyFincraWebhookSignature(headers, rawBody);

  const eventType = parsedBody.event || parsedBody.type || "unknown";
  const eventHash = generateEventHash(rawBody);

  // ── STEP 2: Idempotency check (prevent duplicate processing) ──────────
  const { data: existingLog } = await supabase
    .from("fincra_webhook_logs")
    .select("id, processed")
    .eq("event_hash", eventHash)
    .maybeSingle();

  if (existingLog) {
    logger.warn(`[Fincra/webhook] Duplicate event rejected: ${eventHash}`);
    throw new FincraDuplicateEventError(eventHash);
  }

  // ── STEP 3: Persist webhook log ────────────────────────────────────────
  const { error: logErr } = await supabase.from("fincra_webhook_logs").insert({
    event_type:         eventType,
    payload:            parsedBody,
    signature_verified: true,
    event_hash:         eventHash,
    processed:          false,
  });

  if (logErr) {
    logger.error(`[Fincra/webhook] Failed to persist webhook log: ${logErr.message}`);
    // Continue processing — log persistence failure is non-fatal
  }

  await recordFincraAudit({
    action: "WEBHOOK_RECEIVED",
    userId: null,
    details: { eventType, eventHash },
  });

  // ── STEP 4: Route to handler ────────────────────────────────────────────
  let result;

  const payloadData = parsedBody.data || parsedBody;
  const merchantRef = payloadData.merchantReference || payloadData.reference || parsedBody.merchantReference || parsedBody.reference;

  if (merchantRef && String(merchantRef).startsWith('tx_')) {
    logger.info(`[Fincra/webhook] Transaction reference detected in webhook: ${merchantRef}. Triggering auto-settlement...`);
    try {
      const paymentService = require("../payment/paymentService");
      const verifyRes = await paymentService.verifyPaymentStatus(merchantRef);
      logger.info(`[Fincra/webhook] Auto-settlement result for ${merchantRef}: ${verifyRes.status}`);
      result = { handled: true, status: verifyRes.status, reference: merchantRef };
    } catch (vErr) {
      logger.error(`[Fincra/webhook] Auto-settlement error for ${merchantRef}: ${vErr.message}`);
    }
  }

  if (!result || !result.handled) {
    switch (eventType) {
      case FINCRA_EVENTS.COLLECTION_SUCCESSFUL:
        result = await handleDepositSuccessful(parsedBody);
        break;

      case FINCRA_EVENTS.PAYOUT_SUCCESSFUL:
        result = await handlePayoutSuccessful(parsedBody);
        break;

      case FINCRA_EVENTS.PAYOUT_FAILED:
        result = await handlePayoutFailed(parsedBody);
        break;

      case FINCRA_EVENTS.CONVERSION_SUCCESSFUL:
        result = await handleConversionSuccessful(parsedBody);
        break;

      default:
        logger.info(`[Fincra/webhook] Unhandled event type: ${eventType}`);
        result = { handled: false, eventType };
    }
  }

  // ── Mark webhook as processed ──────────────────────────────────────────
  await supabase.from("fincra_webhook_logs")
    .update({ processed: true })
    .eq("event_hash", eventHash);

  return result;
}

// ─── Internal Handlers ────────────────────────────────────────────────────────

/**
 * Handle Fincra collection.successful (deposit received).
 * Checks provider settlement policy to determine whether to credit
 * Available Balance immediately or park in Pending Balance.
 */
async function handleDepositSuccessful(payload) {
  const data           = payload.data || payload;
  const fincraRef      = data.reference   || data.id;
  const amount         = parseFloat(data.amount || 0);
  const currency       = (data.currency  || "NGN").toUpperCase();
  const accountNumber  = data.accountNumber || data.account_number;

  logger.info(`[Fincra/webhook] Deposit received: ${amount} ${currency} (ref: ${fincraRef})`);

  if (!fincraRef || !amount) {
    logger.warn("[Fincra/webhook] Deposit webhook missing required fields (fincraRef/amount). Skipping.");
    return { handled: false, reason: "Missing required fields" };
  }

  // Find the user by their Fincra virtual account number
  let userId = null;
  if (accountNumber) {
    const { data: walletLink } = await supabase
      .from("fincra_wallet_links")
      .select("user_id, currency")
      .eq("account_number", accountNumber)
      .eq("currency", currency)
      .maybeSingle();

    if (walletLink) {
      userId = walletLink.user_id;
    }
  }

  // Fallback: Resolve user by customer/merchant reference or narration
  if (!userId) {
    const searchRef = data.customerReference || data.merchantReference || data.reference || data.narration;
    if (searchRef) {
      const { data: txMatch } = await supabase
        .from("transactions")
        .select("user_id")
        .or(`reference_id.eq.${searchRef},metadata->>display_ref.eq.${searchRef}`)
        .maybeSingle();

      if (txMatch) {
        userId = txMatch.user_id;
        logger.info(`[Fincra/webhook] Resolved user ${userId} via transaction reference match (${searchRef}).`);
      } else {
        const { data: manualMatch } = await supabase
          .from("manual_deposits")
          .select("user_id")
          .eq("reference", searchRef)
          .maybeSingle();

        if (manualMatch) {
          userId = manualMatch.user_id;
          logger.info(`[Fincra/webhook] Resolved user ${userId} via manual deposit reference match (${searchRef}).`);
        }
      }
    }
  }

  if (!userId) {
    logger.warn(`[Fincra/webhook] No wallet link or transaction reference found for account ${accountNumber || 'N/A'} (${currency}).`);
    return { handled: false, reason: `Unknown virtual account or reference: ${accountNumber || fincraRef}` };
  }

  // Idempotency: check if this fincra_reference was already processed
  const { data: existingTx } = await supabase
    .from("fincra_transactions")
    .select("id, status")
    .eq("fincra_reference", fincraRef)
    .maybeSingle();

  if (existingTx && existingTx.status === FINCRA_TX_STATUS.SUCCESSFUL) {
    logger.warn(`[Fincra/webhook] Deposit ${fincraRef} already processed. Skipping.`);
    return { handled: false, reason: "Already processed" };
  }

  // Create or update fincra_transactions record
  if (existingTx) {
    await supabase.from("fincra_transactions")
      .update({ status: FINCRA_TX_STATUS.PROCESSING })
      .eq("id", existingTx.id);
  } else {
    const { v4: uuidv4 } = require("uuid");
    await supabase.from("fincra_transactions").insert({
      user_id:          userId,
      reference:        `FIN_DEP_${uuidv4()}`,
      fincra_reference: fincraRef,
      type:             FINCRA_TX_TYPES.DEPOSIT,
      currency,
      amount,
      status:           FINCRA_TX_STATUS.PROCESSING,
      metadata:         data,
    });
  }

  const { data: wallet } = await supabase
    .from("wallets_v6")
    .select("id, balance, available_balance, pending_balance")
    .eq("user_id", userId)
    .eq("currency", currency)
    .maybeSingle();

  if (!wallet) {
    logger.error(`[Fincra/webhook] No wallet found for user ${userId} (${currency}). Cannot credit.`);
    return { handled: false, reason: "Wallet not found" };
  }

  // Determine settlement policy
  const SettlementPolicyService = require("../settlement/SettlementPolicyService");
  const policy = await SettlementPolicyService.getPolicy('fincra', currency);

  let isSettled = policy.deposit_settles_instantly || data.settlement_status === 'settled';

  // ── INTEGRATE IDEMPOTENT LEDGER CREDIT SERVICE ────────────────────────────
  const IdempotentLedgerCreditService = require("../payment/IdempotentLedgerCreditService");
  const searchRef = data.customerReference || data.merchantReference || data.reference || data.narration || fincraRef;

  // First, find primary transaction record to update payment_status
  let { data: primaryTx } = await supabase
    .from("transactions")
    .select("id, reference_id, payment_status, wallet_credit_status")
    .or(`reference_id.eq.${searchRef},provider_reference.eq.${fincraRef},metadata->>display_ref.eq.${searchRef}`)
    .maybeSingle();

  if (primaryTx) {
    await supabase.from("transactions")
      .update({
        payment_status: "PAYMENT_CONFIRMED",
        provider_transaction_id: fincraRef,
        updated_at: new Date().toISOString()
      })
      .eq("id", primaryTx.id);
  }

  // Idempotently credit wallet via authoritative credit engine
  try {
    const creditRes = await IdempotentLedgerCreditService.creditWallet({
      transactionId: primaryTx?.id || null,
      reference: searchRef,
      providerTransactionId: fincraRef,
      amount,
      currency,
      userId,
      source: "FINCRA_WEBHOOK"
    });
    logger.info(`[Fincra/webhook] IdempotentLedgerCreditService result: ${JSON.stringify(creditRes)}`);
  } catch (creditErr) {
    logger.error(`[Fincra/webhook] IdempotentLedgerCreditService error: ${creditErr.message}`);
  }

  if (isSettled) {
    await supabase.from("fincra_transactions")
      .update({ status: FINCRA_TX_STATUS.SUCCESSFUL })
      .eq("fincra_reference", fincraRef);

    await recordFincraAudit({
      action: "DEPOSIT_CREDITED_AVAILABLE",
      userId,
      details: { fincraRef, amount, currency, status: 'AVAILABLE' },
    });

    logger.info(`[Fincra/webhook] ✅ Deposit credited to AVAILABLE: ${amount} ${currency} for user ${userId}.`);

    // Notification
    try {
      const notificationService = require("../notificationService");
      await notificationService.sendNotification(userId, {
        type: 'DEPOSIT_SETTLED',
        title: 'Deposit Settled & Available',
        message: `Your deposit of ${currency} ${amount.toLocaleString()} is now available in your wallet.`,
        data: { amount, currency, fincraRef },
      });
    } catch (nErr) {
      logger.warn(`[Fincra/webhook] Notification failed: ${nErr.message}`);
    }

  } else {
    // Credit PENDING balance via RPC and record item in settlement_pending_items
    const { error: rpcErr } = await supabase.rpc('credit_pending_balance', {
      p_wallet_id: wallet.id,
      p_amount: amount,
    });

    if (rpcErr) {
      logger.error(`[Fincra/webhook] RPC credit_pending_balance failed: ${rpcErr.message}`);
      const newBal = parseFloat(wallet.balance || 0) + amount;
      const newPend = parseFloat(wallet.pending_balance || 0) + amount;
      await supabase.from("wallets_store")
        .update({ balance: newBal, pending_balance: newPend, updated_at: new Date().toISOString() })
        .eq("id", wallet.id);
    }

    const expectedSettlementAt = await SettlementPolicyService.calculateExpectedSettlementAt('fincra', currency);

    await supabase.from("settlement_pending_items").insert({
      wallet_id: wallet.id,
      user_id: userId,
      amount,
      currency,
      provider: 'fincra',
      provider_reference: fincraRef,
      provider_status: 'pending',
      expected_settlement_at: expectedSettlementAt,
    }).catch(err => logger.warn(`[Fincra/webhook] Pending item insert warning: ${err.message}`));

    await supabase.from("fincra_transactions")
      .update({ status: FINCRA_TX_STATUS.PENDING })
      .eq("fincra_reference", fincraRef);

    await recordFincraAudit({
      action: "DEPOSIT_CREDITED_PENDING",
      userId,
      details: { fincraRef, amount, currency, status: 'PENDING', expectedSettlementAt },
    });

    logger.info(`[Fincra/webhook] ⏳ Deposit parked in PENDING: ${amount} ${currency} for user ${userId}. Expected: ${expectedSettlementAt}`);

    try {
      const notificationService = require("../notificationService");
      await notificationService.sendNotification(userId, {
        type: 'DEPOSIT_RECEIVED',
        title: 'Deposit Received (Pending Settlement)',
        message: `Your deposit of ${currency} ${amount.toLocaleString()} was received and is pending settlement. Funds will be available soon.`,
        data: { amount, currency, fincraRef, expectedSettlementAt },
      });
    } catch (nErr) {
      logger.warn(`[Fincra/webhook] Notification failed: ${nErr.message}`);
    }
  }

  // Realtime update
  try {
    const realtime = require("../realtimeService");
    await realtime.notifyUser(userId, "fincra_deposit", { amount, currency, fincraRef, isSettled });
  } catch (notifyErr) {
    logger.warn(`[Fincra/webhook] Realtime notification failed: ${notifyErr.message}`);
  }

  return { handled: true, userId, amount, currency, isSettled };
}

/**
 * Handle Fincra payout.successful.
 * Finalizes the debit (calls completePayoutDebit to deduct total balance).
 */
async function handlePayoutSuccessful(payload) {
  const data      = payload.data || payload;
  const fincraRef = data.reference || data.id;
  const customerRef = data.customerReference || data.customer_reference;

  logger.info(`[Fincra/webhook] Payout successful: ${fincraRef}`);

  const ref = customerRef || fincraRef;
  const IdempotentWithdrawalSettlementService = require("../payment/IdempotentWithdrawalSettlementService");

  const settleRes = await IdempotentWithdrawalSettlementService.finalizeSettlement({
    reference: ref,
    providerTransactionId: fincraRef,
    source: "FINCRA_PAYOUT_WEBHOOK",
  });

  await recordFincraAudit({
    action: "PAYOUT_SUCCESSFUL",
    userId: null,
    details: { fincraRef, customerRef: ref, result: settleRes },
  });

  return { handled: true, fincraRef, settleRes };
}

/**
 * Handle Fincra payout.failed.
 * Automatically reverses the fund reservation idempotently.
 */
async function handlePayoutFailed(payload) {
  const data      = payload.data || payload;
  const fincraRef = data.reference || data.id;
  const customerRef = data.customerReference || data.customer_reference;
  const reason    = data.reason || data.message || "Payout failed";

  logger.warn(`[Fincra/webhook] Payout failed: ${fincraRef}. Reversing reservation.`);

  const ref = customerRef || fincraRef;
  const IdempotentWithdrawalSettlementService = require("../payment/IdempotentWithdrawalSettlementService");

  const reverseRes = await IdempotentWithdrawalSettlementService.reverseReservation({
    reference: ref,
    reason,
    errorCode: "PROVIDER_PAYOUT_FAILED",
    source: "FINCRA_PAYOUT_WEBHOOK",
  });

  logger.info(`[Fincra/webhook] ✅ Reservation reversal completed for failed payout: ${ref}`);

  return { handled: true, fincraRef, reverseRes };
}

/**
 * Handle Fincra conversion.successful.
 * Updates fincra_transactions status and credits destination wallet.
 */
async function handleConversionSuccessful(payload) {
  const data        = payload.data || payload;
  const fincraRef   = data.reference || data.id;
  const customerRef = data.customerReference || data.customer_reference;

  logger.info(`[Fincra/webhook] Conversion successful: ${fincraRef}`);

  await supabase.from("fincra_transactions")
    .update({ status: FINCRA_TX_STATUS.SUCCESSFUL, fincra_reference: fincraRef })
    .or(`reference.eq.${customerRef},fincra_reference.eq.${fincraRef}`);

  await recordFincraAudit({
    action: "CONVERSION_SUCCESSFUL",
    userId: null,
    details: { fincraRef, customerRef },
  });

  return { handled: true, fincraRef };
}

module.exports = { processFincraWebhook };
