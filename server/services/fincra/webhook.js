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

    case FINCRA_EVENTS.CONVERSION_FAILED:
      result = await handleConversionFailed(parsedBody);
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
  // Fincra collection webhooks use 'sourceAmount' (what user sent) and 'amountReceived' (after fees).
  // Credit the user with sourceAmount (what they paid), or amountReceived, or destinationAmount.
  const amount         = parseFloat(data.sourceAmount || data.amount || data.amountReceived || data.destinationAmount || 0);
  const currency       = (data.sourceCurrency || data.currency || data.destinationCurrency || "NGN").toUpperCase();
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

  // Fallback 1: Resolve user by customer/merchant reference or narration
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
          logger.info(`[Fincra/webhook] Transaction ${searchRef} already credited. Skipping double credit.`);
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

  // Fallback 2: Match by amount + currency + recent time window against pending deposits.
  // This catches transfers where Fincra doesn't return the user's reference in any field.
  if (!userId && amount > 0) {
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 48-hour window
    const { data: amountMatch } = await supabase
      .from("transactions")
      .select("user_id, id, reference_id, status")
      .eq("type", "DEPOSIT")
      .eq("currency", currency)
      .eq("amount", amount)
      .in("status", ["PENDING", "PROCESSING"])
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (amountMatch) {
      userId = amountMatch.user_id;
      logger.info(`[Fincra/webhook] Resolved user ${userId} via amount+currency+time window match (${amount} ${currency}, tx: ${amountMatch.id}).`);
    }
  }

  // Fallback 3: Match by amount + currency in manual_deposits table
  if (!userId && amount > 0) {
    const cutoff48h = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    const { data: manualAmountMatch } = await supabase
      .from("manual_deposits")
      .select("user_id, reference")
      .eq("currency", currency)
      .eq("amount", amount)
      .eq("status", "pending")
      .gte("created_at", cutoff48h)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (manualAmountMatch) {
      userId = manualAmountMatch.user_id;
      logger.info(`[Fincra/webhook] Resolved user ${userId} via manual_deposits amount match (${amount} ${currency}).`);
    }
  }

  // Fallback 4: Extract NS-XXXXXX reference from description/narration field
  // In shared virtual account mode, the user's deposit reference (e.g., NS-22YWA8D)
  // is embedded in the bank transfer narration/description, not in Fincra's reference field.
  // CHALLENGE: Narrations often concatenate without spaces: "NS 22YWA8DFINCRA JOSSY..."
  // so we can't reliably regex-extract the exact ref. Instead, we grab the raw string
  // after "NS" and try progressively shorter substrings against the DB.
  if (!userId) {
    const narration = data.description || data.narration || data.remark || '';
    const nsRawMatch = narration.match(/NS[-_ ]?([A-Z0-9]+)/i);
    if (nsRawMatch) {
      const rawCapture = nsRawMatch[1].toUpperCase();
      logger.info(`[Fincra/webhook] Raw NS capture from narration: ${rawCapture}`);

      // Try progressively shorter substrings (8 chars down to 5) until DB match
      for (let len = Math.min(rawCapture.length, 8); len >= 5 && !userId; len--) {
        const candidateRef = `NS-${rawCapture.substring(0, len)}`;

        const { data: txMatch } = await supabase
          .from("transactions")
          .select("user_id, id, status, wallet_credit_status")
          .or(`reference_id.eq.${candidateRef},metadata->>display_ref.eq.${candidateRef}`)
          .maybeSingle();

        if (txMatch) {
          // Always extract the user_id — this webhook is for a NEW deposit,
          // even if the matched transaction is already completed
          userId = txMatch.user_id;
          logger.info(`[Fincra/webhook] Resolved user ${userId} via narration reference match (${candidateRef}, len=${len}).`);
          break;
        }

        // Also check manual_deposits
        const { data: manualMatch } = await supabase
          .from("manual_deposits")
          .select("user_id")
          .eq("reference", candidateRef)
          .maybeSingle();
        if (manualMatch) {
          userId = manualMatch.user_id;
          logger.info(`[Fincra/webhook] Resolved user ${userId} via manual_deposits narration match (${candidateRef}, len=${len}).`);
          break;
        }
      }
    }
  }

  // Fallback 5: Match by customerName against profiles (last resort for shared virtual accounts)
  // Fincra sends names like "OBOH AGHOGHO JOSSY" but profile might be "Aghogho jossy oboh"
  // Match each name part individually to handle different name orders
  if (!userId) {
    const customerName = data.customerName || data.senderAccountName || data.customer?.name;
    if (customerName) {
      const nameParts = customerName.trim().split(/\s+/).filter(p => p.length > 1);
      if (nameParts.length >= 2) {
        // Build AND condition: each name part must appear somewhere in full_name
        // Use the two longest name parts for matching (most distinctive)
        const sortedParts = nameParts.sort((a, b) => b.length - a.length).slice(0, 2);
        let query = supabase.from("profiles").select("id");
        for (const part of sortedParts) {
          query = query.ilike("full_name", `%${part}%`);
        }
        const { data: profileMatch } = await query.limit(1).maybeSingle();

        if (profileMatch) {
          userId = profileMatch.id;
          logger.info(`[Fincra/webhook] Resolved user ${userId} via customerName profile match (${customerName}).`);
        }
      }
    }
  }

  if (!userId) {
    logger.warn(`[Fincra/webhook] No wallet link or transaction reference found for account ${accountNumber || 'N/A'} (${currency}). Amount: ${amount}`);
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

  // ── CREDIT VIA AUTHORITATIVE DepositCreditEngine ────────────────────────────
  const DepositCreditEngine = require("../payment/DepositCreditEngine");
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

  // Idempotently credit wallet via the single authoritative engine
  let creditRes = null;
  try {
    creditRes = await DepositCreditEngine.credit({
      transactionId: primaryTx?.id || null,
      reference: searchRef,
      amount,
      currency,
      userId,
      providerTxId: fincraRef,
      source: "FINCRA_WEBHOOK",
    });
    logger.info(`[Fincra/webhook] DepositCreditEngine result: ${JSON.stringify(creditRes)}`);
  } catch (creditErr) {
    logger.error(`[Fincra/webhook] DepositCreditEngine error: ${creditErr.message}`);
  }

  await supabase.from("fincra_transactions")
    .update({ status: FINCRA_TX_STATUS.SUCCESSFUL })
    .eq("fincra_reference", fincraRef);

  await recordFincraAudit({
    action: "DEPOSIT_CREDITED_AVAILABLE",
    userId,
    details: { fincraRef, amount, currency, status: 'AVAILABLE' },
  });

  logger.info(`[Fincra/webhook] ✅ Deposit processed via DepositCreditEngine: ${amount} ${currency} for user ${userId}.`);

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
 * Delegates to fincraOtcFundingService for atomic NGN credit and crypto reservation settlement.
 */
async function handleConversionSuccessful(payload) {
  const data        = payload.data || payload;
  const fincraRef   = data.reference || data.id;
  const customerRef = data.customerReference || data.customer_reference;

  logger.info(`[Fincra/webhook] Processing conversion.successful: ${fincraRef}`);

  const fincraOtcFundingService = require("./fincraOtcFundingService");
  return await fincraOtcFundingService.handleConversionSuccess({
    fincraRef,
    customerRef,
    rawPayload: payload,
  });
}

/**
 * Handle Fincra conversion.failed.
 * Delegates to fincraOtcFundingService to safely release reserved crypto balance.
 */
async function handleConversionFailed(payload) {
  const data        = payload.data || payload;
  const fincraRef   = data.reference || data.id;
  const customerRef = data.customerReference || data.customer_reference;
  const reason      = data.reason || data.message || "Conversion failed";

  logger.warn(`[Fincra/webhook] Processing conversion.failed: ${fincraRef}`);

  const fincraOtcFundingService = require("./fincraOtcFundingService");
  return await fincraOtcFundingService.handleConversionFailure({
    fincraRef,
    customerRef,
    reason,
  });
}

module.exports = { processFincraWebhook };

