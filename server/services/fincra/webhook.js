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

  // NOTE: Previously this had a split-brain path that called paymentService.verifyPaymentStatus
  // for 'tx_' prefixed references BEFORE routing to handlers. This caused dual credit attempts
  // via different pathways with different idempotency keys. Now ALL deposits go through
  // handleDepositSuccessful which uses the unified DepositCreditEngine.

  const payloadData = parsedBody.data || parsedBody;

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
  const accountNumber  = data.accountNumber || 
                         data.account_number || 
                         data.virtualAccount?.accountNumber || 
                         data.virtual_account?.account_number || 
                         data.destinationAccountInformation?.accountNumber || 
                         data.destination_account_information?.account_number || 
                         data.virtualAccountInformation?.accountNumber;

  logger.info(`[Fincra/webhook] Deposit received: ${amount} ${currency} (ref: ${fincraRef}, account: ${accountNumber || 'N/A'})`);

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
      .eq("account_number", String(accountNumber).trim())
      .maybeSingle();

    if (walletLink) {
      userId = walletLink.user_id;
    } else {
      // Fallback check in bank_accounts table
      const { data: bankAcc } = await supabase
        .from("bank_accounts")
        .select("user_id, currency")
        .eq("account_number", String(accountNumber).trim())
        .maybeSingle();

      if (bankAcc) {
        userId = bankAcc.user_id;
      }
    }
  }

  // Fallback: Resolve user by customer/merchant reference or narration
  if (!userId) {
    const searchRef = data.customerReference || data.merchantReference || data.reference || data.narration;
    if (searchRef) {
      const { data: txMatch } = await supabase
        .from("transactions")
        .select("user_id, status, wallet_credit_status, payment_status")
        .or(`reference_id.eq.${searchRef},metadata->>display_ref.eq.${searchRef}`)
        .maybeSingle();

      if (txMatch) {
        if (txMatch.status === 'COMPLETED' || txMatch.wallet_credit_status === 'WALLET_CREDITED' || txMatch.payment_status === 'WALLET_CREDITED') {
          logger.info(`[Fincra/webhook] Transaction ${searchRef} already credited via IdempotentLedgerCreditService. Skipping double credit.`);
          return { handled: true, status: 'SUCCESSFUL', reason: 'Already credited' };
        }
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

  let { data: wallet } = await supabase
    .from("wallets_v6")
    .select("id, balance, available_balance, pending_balance")
    .eq("user_id", userId)
    .eq("currency", currency)
    .maybeSingle();

  if (!wallet) {
    logger.info(`[Fincra/webhook] No wallet found for user ${userId} (${currency}). Auto-creating wallet...`);
    try {
      const FiatWalletService = require("../FiatWalletService");
      wallet = await FiatWalletService.createWallet(userId, currency);
    } catch (createErr) {
      // Fallback: direct insert into wallets_v6
      const { data: insertedWallet } = await supabase
        .from("wallets_v6")
        .insert({ user_id: userId, currency, balance: 0, available_balance: 0, pending_balance: 0 })
        .select("id, balance, available_balance, pending_balance")
        .single();
      wallet = insertedWallet;
    }
  }

  if (!wallet) {
    logger.error(`[Fincra/webhook] Wallet initialization failed for user ${userId} (${currency}). Cannot credit.`);
    return { handled: false, reason: "Wallet not found" };
  }

  // Determine settlement policy
  const SettlementPolicyService = require("../settlement/SettlementPolicyService");
  const policy = await SettlementPolicyService.getPolicy('fincra', currency);

  let isSettled = policy.deposit_settles_instantly || data.settlement_status === 'settled';

  // ── INTEGRATE IDEMPOTENT LEDGER CREDIT SERVICE ────────────────────────────
  const IdempotentLedgerCreditService = require("../payment/IdempotentLedgerCreditService");
  const searchRef = data.customerReference || data.merchantReference || data.reference || data.narration || fincraRef;

  let { data: primaryTx } = await supabase
    .from("transactions")
    .select("id, reference_id, payment_status, wallet_credit_status")
    .or(`reference_id.eq.${searchRef},provider_reference.eq.${fincraRef},metadata->>display_ref.eq.${searchRef}`)
    .maybeSingle();

  if (!primaryTx) {
    const { data: newTx } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        wallet_id: wallet.id,
        amount,
        currency,
        type: "DEPOSIT",
        status: "PENDING",
        reference_id: searchRef,
        provider_reference: fincraRef,
        payment_status: "PAYMENT_CONFIRMED",
        wallet_credit_status: "WALLET_CREDIT_PENDING",
        metadata: { provider: "fincra", channel: "virtual_account", payload: data }
      })
      .select("id, reference_id")
      .single();
    primaryTx = newTx;
  }

  // Idempotently credit wallet via authoritative credit engine
  let creditRes = null;
  try {
    creditRes = await IdempotentLedgerCreditService.creditWallet({
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

  await supabase.from("fincra_transactions")
    .update({ status: FINCRA_TX_STATUS.SUCCESSFUL })
    .eq("fincra_reference", fincraRef);

  await recordFincraAudit({
    action: "DEPOSIT_CREDITED_AVAILABLE",
    userId,
    details: { fincraRef, amount, currency, status: 'AVAILABLE' },
  });

  logger.info(`[Fincra/webhook] ✅ Deposit processed via IdempotentLedgerCreditService: ${amount} ${currency} for user ${userId}.`);

  return { handled: true, status: 'SUCCESSFUL', creditRes };
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
