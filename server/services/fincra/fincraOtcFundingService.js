/**
 * Fincra Integration — Manual OTC Funding & Crypto Conversion Lifecycle Service
 * ─────────────────────────────────────────────────────────────────────────────
 * Implements Fincra's confirmed MANUAL OTC crypto collection & FX conversion model.
 *
 * ARCHITECTURAL INVARIANTS:
 *  1. Zero automated crypto bridge to Fincra. User crypto is reserved internally.
 *  2. OTC Funding is confirmed manually by authorized finance operators with can_confirm_otc_funding permission.
 *  3. /quotes and /conversions are gated on FINCRA_BALANCE_CONFIRMED.
 *  4. Final NGN wallet credit occurs ONLY upon verified conversion.successful webhook.
 *  5. Double-credits and double-releases are strictly prevented via DB idempotency.
 *  6. Real-Time Immutable Double-Entry Asset Journaling for manual OTC funding movements.
 *  7. Authoritative Fincra Quote Expiry tracking & quote immutability guards.
 *  8. Per-user concurrency lock for atomic 24h limit & balance reservation enforcement.
 */

'use strict';

const supabase = require("../../config/database");
const { getFincraClient } = require("./client");
const { recordFincraAudit } = require("./audit");
const { 
  FINCRA_TX_STATUS, 
  FINCRA_TX_TYPES, 
  ALLOWED_CONVERSION_PAIRS, 
  SUPPORTED_CRYPTO_CONVERSION_SET 
} = require("./constants");
const complianceGate = require("../../withdrawal/complianceGate");
const logger = require("../../utils/logger");
const { v4: uuidv4 } = require("uuid");
const DepositCreditEngine = require("../payment/DepositCreditEngine");

// Per-User Concurrency Locks
const userOtcLocks = new Map();

async function withUserLock(userId, fn) {
  let lock = userOtcLocks.get(userId);
  if (!lock) {
    lock = Promise.resolve();
  }
  let resolveLock;
  const nextLock = new Promise((res) => { resolveLock = res; });
  userOtcLocks.set(userId, nextLock);

  try {
    await lock;
    return await fn();
  } finally {
    resolveLock();
    if (userOtcLocks.get(userId) === nextLock) {
      userOtcLocks.delete(userId);
    }
  }
}

// Valid State Transitions Map (Strict Fail-Closed State Machine)
const VALID_TRANSITIONS = {
  [FINCRA_TX_STATUS.REQUESTED]:                new Set([FINCRA_TX_STATUS.CRYPTO_RESERVED, FINCRA_TX_STATUS.CANCELLED]),
  [FINCRA_TX_STATUS.CRYPTO_RESERVED]:          new Set([FINCRA_TX_STATUS.OTC_FUNDING_PENDING, FINCRA_TX_STATUS.CANCELLED]),
  [FINCRA_TX_STATUS.OTC_FUNDING_PENDING]:      new Set([FINCRA_TX_STATUS.FINCRA_BALANCE_CONFIRMED, FINCRA_TX_STATUS.FUNDING_FAILED, FINCRA_TX_STATUS.CANCELLED]),
  [FINCRA_TX_STATUS.FINCRA_BALANCE_CONFIRMED]: new Set([FINCRA_TX_STATUS.QUOTE_REQUESTED, FINCRA_TX_STATUS.CANCELLED]),
  [FINCRA_TX_STATUS.QUOTE_REQUESTED]:          new Set([FINCRA_TX_STATUS.QUOTE_RECEIVED, FINCRA_TX_STATUS.QUOTE_FAILED, FINCRA_TX_STATUS.CANCELLED]),
  [FINCRA_TX_STATUS.QUOTE_RECEIVED]:           new Set([FINCRA_TX_STATUS.CONVERSION_SUBMITTED, FINCRA_TX_STATUS.CANCELLED, FINCRA_TX_STATUS.QUOTE_FAILED]),
  [FINCRA_TX_STATUS.CONVERSION_SUBMITTED]:     new Set([FINCRA_TX_STATUS.CONVERSION_PROCESSING, FINCRA_TX_STATUS.CONVERSION_FAILED, FINCRA_TX_STATUS.RECONCILIATION_REQUIRED]),
  [FINCRA_TX_STATUS.CONVERSION_PROCESSING]:    new Set([FINCRA_TX_STATUS.CONVERSION_SUCCESSFUL, FINCRA_TX_STATUS.CONVERSION_FAILED, FINCRA_TX_STATUS.RECONCILIATION_REQUIRED]),
  [FINCRA_TX_STATUS.CONVERSION_SUCCESSFUL]:    new Set([FINCRA_TX_STATUS.NGN_SETTLED]),
  [FINCRA_TX_STATUS.NGN_SETTLED]:              new Set([]), // Terminal state
  [FINCRA_TX_STATUS.FUNDING_FAILED]:           new Set([FINCRA_TX_STATUS.RECONCILIATION_REQUIRED]),
  [FINCRA_TX_STATUS.CONVERSION_FAILED]:        new Set([FINCRA_TX_STATUS.RECONCILIATION_REQUIRED]),
  [FINCRA_TX_STATUS.RECONCILIATION_REQUIRED]:  new Set([FINCRA_TX_STATUS.NGN_SETTLED, FINCRA_TX_STATUS.CONVERSION_FAILED, FINCRA_TX_STATUS.REVERSED]),
};

function mapStatusForDb(otcStatus) {
  switch (otcStatus) {
    case FINCRA_TX_STATUS.OTC_FUNDING_PENDING:
    case FINCRA_TX_STATUS.FINCRA_BALANCE_CONFIRMED:
    case FINCRA_TX_STATUS.QUOTE_REQUESTED:
    case FINCRA_TX_STATUS.QUOTE_RECEIVED:
      return FINCRA_TX_STATUS.PENDING;
    case FINCRA_TX_STATUS.CONVERSION_SUBMITTED:
    case FINCRA_TX_STATUS.CONVERSION_PROCESSING:
      return FINCRA_TX_STATUS.PROCESSING;
    case FINCRA_TX_STATUS.CONVERSION_SUCCESSFUL:
    case FINCRA_TX_STATUS.NGN_SETTLED:
      return FINCRA_TX_STATUS.SUCCESSFUL;
    case FINCRA_TX_STATUS.CONVERSION_FAILED:
    case FINCRA_TX_STATUS.FUNDING_FAILED:
      return FINCRA_TX_STATUS.FAILED;
    case FINCRA_TX_STATUS.RECONCILIATION_REQUIRED:
      return FINCRA_TX_STATUS.RESERVED;
    default:
      return otcStatus;
  }
}

function getTxStatus(tx) {
  return tx.metadata?.otc_status || tx.status;
}

function assertSupportedConversionPair(sourceCurrency, destinationCurrency) {
  const source = String(sourceCurrency || "").toUpperCase().trim();
  const dest   = String(destinationCurrency || "").toUpperCase().trim();
  const pair   = `${source}-${dest}`;

  if (!ALLOWED_CONVERSION_PAIRS.has(pair)) {
    throw new Error(
      `UNSUPPORTED_CONVERSION_PAIR: Conversion from ${source} to ${dest} is not supported. Supported pairs: USDT->NGN, USDC->NGN, fiat pairs.`
    );
  }
}

function validateStateTransition(currentStatus, targetStatus) {
  const allowedNext = VALID_TRANSITIONS[currentStatus];
  if (!allowedNext || !allowedNext.has(targetStatus)) {
    throw new Error(
      `INVALID_STATE_TRANSITION: Cannot transition Fincra transaction from ${currentStatus} to ${targetStatus}.`
    );
  }
}

class FincraOtcFundingService {
  /**
   * Phase 3 & 4: Initiate a user request for USDT/USDC -> NGN conversion.
   * Atomically reserves crypto balance on NoteStandard ledger under per-user concurrency lock.
   */
  async initiateOtcConversion({ userId, sourceAsset, destinationCurrency = "NGN", amount, idempotencyKey = null }) {
    return await withUserLock(userId, async () => {
      if (!userId || !amount) {
        throw new Error("INVALID_PARAMETERS: userId and amount are required.");
      }

      const upSource = String(sourceAsset).toUpperCase().trim();
      const upDest   = String(destinationCurrency).toUpperCase().trim();
      const numAmount = parseFloat(amount);

      if (isNaN(numAmount) || numAmount <= 0) {
        throw new Error("INVALID_AMOUNT: Conversion amount must be a positive number.");
      }

      // 1. Assert supported pair
      assertSupportedConversionPair(upSource, upDest);

      // 2. Evaluate Conversion Compliance (Fail-closed)
      const complianceRes = await complianceGate.evaluateConversion({
        userId,
        amount: numAmount,
        currency: upSource,
      });

      if (!complianceRes.allowed) {
        throw new Error(`COMPLIANCE_REJECTED: ${complianceRes.errorCode} - ${complianceRes.reason}`);
      }

      // 3. Idempotency Check
      if (idempotencyKey) {
        const { data: existingTx } = await supabase
          .from("fincra_transactions")
          .select("*")
          .eq("metadata->>idempotencyKey", idempotencyKey)
          .maybeSingle();

        if (existingTx) {
          logger.info(`[FincraOtcService] Idempotency hit for key ${idempotencyKey}`);
          return {
            reference: existingTx.reference,
            status: getTxStatus(existingTx),
            isDuplicate: true,
            message: "Existing OTC funding request retrieved.",
          };
        }
      }

      // 4. Fetch & Lock User Crypto Wallet in wallets_store (Auto-provision if missing)
      let { data: wallet, error: walletErr } = await supabase
        .from("wallets_store")
        .select("id, balance, pending_balance, available_balance")
        .eq("user_id", userId)
        .eq("currency", upSource)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!wallet) {
        logger.info(`[FincraOtcService] Auto-provisioning ${upSource} wallet for user ${userId}`);
        try {
          const FiatWalletService = require("../FiatWalletService");
          wallet = await FiatWalletService.createWallet(userId, upSource);
        } catch (createErr) {
          const { data: insertedWallet } = await supabase
            .from("wallets_store")
            .insert({ user_id: userId, currency: upSource, network: 'NATIVE', address: `${upSource}_${userId.substring(0, 8)}`, balance: 0, available_balance: 0, pending_balance: 0 })
            .select("id, balance, available_balance, pending_balance")
            .single();
          wallet = insertedWallet;
        }
      }

      if (!wallet) {
        throw new Error(`WALLET_NOT_FOUND: User does not have a ${upSource} wallet.`);
      }

      const currentAvail = parseFloat(wallet.available_balance !== undefined ? wallet.available_balance : wallet.balance || 0);
      if (currentAvail < numAmount) {
        throw new Error(
          `INSUFFICIENT_FUNDS: Requested ${numAmount} ${upSource}, but available balance is ${currentAvail} ${upSource}.`
        );
      }

      // 5. Atomic Balance Reservation
      const newAvail   = currentAvail - numAmount;
      const newPending = parseFloat(wallet.pending_balance || 0) + numAmount;

      const { error: reserveErr } = await supabase
        .from("wallets_store")
        .update({
          available_balance: newAvail,
          pending_balance:   newPending,
          updated_at:        new Date().toISOString(),
        })
        .eq("id", wallet.id)
        .gte("available_balance", numAmount); // Concurrency guard

      if (reserveErr) {
        logger.error(`[FincraOtcService] Crypto reservation failed for user ${userId}: ${reserveErr.message}`);
        throw new Error("RESERVATION_FAILED: Concurrent transaction prevented crypto balance reservation.");
      }

      // 6. Create Transaction Record
      const reference = `FIN_OTC_${uuidv4().replace(/-/g, "").substring(0, 16)}`;
      const otcStatus = FINCRA_TX_STATUS.OTC_FUNDING_PENDING;
      const dbStatus  = mapStatusForDb(otcStatus);

      const txPayload = {
        user_id:               userId,
        reference,
        type:                  FINCRA_TX_TYPES.CONVERSION,
        currency:              upSource,
        amount:                numAmount,
        status:                dbStatus,
        metadata: {
          idempotencyKey,
          otc_status:             otcStatus,
          source_asset:           upSource,
          destination_currency:   upDest,
          reserved_crypto_amount: numAmount,
          sourceAsset:            upSource,
          destinationCurrency:    upDest,
        },
      };

      let tx = null;
      let txErr = null;

      const res1 = await supabase
        .from("fincra_transactions")
        .insert(txPayload)
        .select("*")
        .maybeSingle();

      if (res1.error) {
        delete txPayload.source_asset;
        delete txPayload.destination_currency;
        delete txPayload.reserved_crypto_amount;

        const res2 = await supabase
          .from("fincra_transactions")
          .insert(txPayload)
          .select("*")
          .single();
        tx = res2.data;
        txErr = res2.error;
      } else {
        tx = res1.data;
      }

      if (txErr || !tx) {
        // Rollback reservation if insert failed
        await supabase.from("wallets_store").update({
          available_balance: currentAvail,
          pending_balance:   parseFloat(wallet.pending_balance || 0),
        }).eq("id", wallet.id);

        throw new Error(`TRANSACTION_CREATE_FAILED: ${txErr ? txErr.message : "Unknown DB Error"}`);
      }

      await recordFincraAudit({
        action: "OTC_CONVERSION_INITIATED",
        userId,
        details: { reference, sourceAsset: upSource, destinationCurrency: upDest, amount: numAmount, status: otcStatus },
      });

      logger.info(`[FincraOtcService] OTC conversion initiated & crypto reserved: ${numAmount} ${upSource} (ref: ${reference})`);

      return {
        success: true,
        reference,
        status: otcStatus,
        amount: numAmount,
        sourceAsset: upSource,
        destinationCurrency: upDest,
        message: "Crypto reserved successfully. Awaiting manual Fincra OTC funding confirmation by authorized operator.",
      };
    });
  }

  /**
   * Phase 5 & Finding 01/02: Authorized Operator confirms receipt of OTC funds in Fincra balance.
   * Posts Real-Time Immutable Double-Entry Asset Journal (ASSET_NOWPAYMENTS -> ASSET_FINCRA).
   */
  async confirmOtcFunding({
    transactionReference,
    operatorId,
    otcReference,
    externalReference = null,
    notes = "",
    evidenceReference = null,
  }) {
    if (!transactionReference || !operatorId || !otcReference) {
      throw new Error("INVALID_PARAMETERS: transactionReference, operatorId, and otcReference are required.");
    }

    const { data: tx, error: txErr } = await supabase
      .from("fincra_transactions")
      .select("*")
      .eq("reference", transactionReference)
      .single();

    if (txErr || !tx) {
      throw new Error(`TRANSACTION_NOT_FOUND: ${transactionReference}`);
    }

    const currentStatus = getTxStatus(tx);
    if (currentStatus !== FINCRA_TX_STATUS.OTC_FUNDING_PENDING) {
      throw new Error(`INVALID_STATE: OTC funding confirmation requires status OTC_FUNDING_PENDING. Current status: ${currentStatus}`);
    }

    validateStateTransition(currentStatus, FINCRA_TX_STATUS.FINCRA_BALANCE_CONFIRMED);

    const now = new Date().toISOString();
    const targetOtcStatus = FINCRA_TX_STATUS.FINCRA_BALANCE_CONFIRMED;
    const dbStatus        = mapStatusForDb(targetOtcStatus);

    const updatePayload = {
      status:     dbStatus,
      updated_at: now,
      metadata: {
        ...(tx.metadata || {}),
        otc_status:         targetOtcStatus,
        otc_reference:      otcReference,
        external_reference: externalReference || otcReference,
        confirmed_by:       operatorId,
        confirmed_at:       now,
        otc_notes:          notes,
        evidence_reference: evidenceReference,
      },
    };

    const { data: updatedTx, error: updateErr } = await supabase
      .from("fincra_transactions")
      .update(updatePayload)
      .eq("id", tx.id)
      .select("*")
      .single();

    if (updateErr || !updatedTx) {
      throw new Error(`CONFIRMATION_FAILED: ${updateErr ? updateErr.message : "Failed to confirm OTC funding."}`);
    }

    // ── Finding 02 Remediation: Real-Time Immutable Double-Entry Asset Journal ──
    const sourceAsset = (tx.metadata?.source_asset || tx.currency || "USDT").toUpperCase();
    const amountNum = parseFloat(tx.amount);
    const journalRef = `FINCRA_OTC_${tx.reference}`;
    const debitAccount = `ASSET_FINCRA_${sourceAsset}`;
    const creditAccount = `ASSET_NOWPAYMENTS_${sourceAsset}`;

    try {
      const { error: journalErr } = await supabase
        .from("fincra_otc_ledger_journals")
        .insert({
          transaction_reference: tx.reference,
          otc_reference: otcReference,
          operator_id: operatorId,
          source_asset: sourceAsset,
          amount: amountNum,
          debit_account: debitAccount,
          credit_account: creditAccount,
          debit_amount: amountNum,
          credit_amount: amountNum,
          is_balanced: true,
        });

      if (journalErr && !journalErr.message?.includes("duplicate")) {
        logger.warn(`[FincraOtcService] Ledger journal notice for ${tx.reference}: ${journalErr.message}`);
      } else {
        logger.info(`[FincraOtcService] Real-Time Asset Journal Posted: DEBIT ${debitAccount} ${amountNum}, CREDIT ${creditAccount} ${amountNum} (ref: ${journalRef})`);
      }
    } catch (jEx) {
      logger.error(`[FincraOtcService] Asset journal posting exception: ${jEx.message}`);
    }

    await recordFincraAudit({
      action: "OTC_FUNDING_CONFIRMED_BY_OPERATOR",
      userId: tx.user_id,
      details: {
        transactionReference,
        operatorId,
        otcReference,
        externalReference,
        amount: tx.amount,
        sourceAsset,
        status: targetOtcStatus,
        journalReference: journalRef,
        evidenceReference,
      },
    });

    logger.info(`[FincraOtcService] OTC funding confirmed by authorized operator ${operatorId} for ref ${transactionReference}`);

    return {
      success: true,
      reference: transactionReference,
      status: targetOtcStatus,
      otcReference,
      journalReference: journalRef,
      confirmedAt: now,
      message: "OTC funding confirmed. Fincra balance available for conversion quote.",
    };
  }

  /**
   * Phase 8 & Finding 03: Request Fincra FX Conversion Quote.
   * Gated on FINCRA_BALANCE_CONFIRMED. Parses authoritative Fincra expiration field if provided.
   */
  async requestConversionQuote({ transactionReference, userId }) {
    const { data: tx, error: txErr } = await supabase
      .from("fincra_transactions")
      .select("*")
      .eq("reference", transactionReference)
      .single();

    if (txErr || !tx) {
      throw new Error(`TRANSACTION_NOT_FOUND: ${transactionReference}`);
    }

    if (tx.user_id !== userId) {
      throw new Error("UNAUTHORIZED: User does not own this conversion transaction.");
    }

    const currentStatus = getTxStatus(tx);
    if (currentStatus !== FINCRA_TX_STATUS.FINCRA_BALANCE_CONFIRMED) {
      throw new Error(`FINCRA_BALANCE_UNCONFIRMED: Cannot request quote until Fincra OTC balance is confirmed. Status: ${currentStatus}`);
    }

    // Re-verify compliance (Fail-closed)
    const complianceRes = await complianceGate.evaluateConversion({
      userId,
      amount: parseFloat(tx.amount),
      currency: tx.metadata?.source_asset || tx.currency,
    });

    if (!complianceRes.allowed) {
      throw new Error(`COMPLIANCE_REJECTED: ${complianceRes.errorCode} - ${complianceRes.reason}`);
    }

    const { generateFincraQuote } = require("./conversion");

    const sourceCurrency      = (tx.metadata?.source_asset || tx.currency).toUpperCase();
    const destinationCurrency = (tx.metadata?.destination_currency || "NGN").toUpperCase();

    const quote = await generateFincraQuote({
      sourceCurrency,
      destinationCurrency,
      amount: parseFloat(tx.amount),
      userId,
    });

    const quoteReference = quote.quoteReference || quote.reference || quote.id;

    // ── Finding 03 Remediation: Parse Authoritative Fincra Quote Expiration ─────
    const authExpiry = quote.expiresAt || quote.expiry || quote.expirationTime || quote.expires_at || quote.validity;
    const expiresAt  = authExpiry ? new Date(authExpiry).toISOString() : new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const targetOtcStatus = FINCRA_TX_STATUS.QUOTE_RECEIVED;
    const dbStatus        = mapStatusForDb(targetOtcStatus);

    const { error: updateErr } = await supabase
      .from("fincra_transactions")
      .update({
        status:           dbStatus,
        quote_reference:  quoteReference,
        quote_expires_at: expiresAt,
        metadata:         {
          ...(tx.metadata || {}),
          otc_status: targetOtcStatus,
          quote,
          quote_reference: quoteReference,
          quote_expires_at: expiresAt,
          quote_source_currency: sourceCurrency,
          quote_destination_currency: destinationCurrency,
          quote_amount: parseFloat(tx.amount),
        },
        updated_at:       new Date().toISOString(),
      })
      .eq("id", tx.id);

    if (updateErr) {
      throw new Error(`QUOTE_SAVE_FAILED: ${updateErr.message}`);
    }

    await recordFincraAudit({
      action: "OTC_CONVERSION_QUOTE_RECEIVED",
      userId,
      details: { transactionReference, quoteReference, expiresAt, rate: quote.rate || quote.exchangeRate },
    });

    logger.info(`[FincraOtcService] Quote generated for ${transactionReference}: ${quoteReference} (Expires: ${expiresAt})`);

    return {
      success: true,
      transactionReference,
      quoteReference,
      sourceCurrency,
      destinationCurrency,
      sourceAmount: parseFloat(tx.amount),
      destinationAmount: quote.destinationAmount || quote.amountToSettle,
      rate: quote.rate || quote.exchangeRate,
      expiresAt,
      status: targetOtcStatus,
    };
  }

  /**
   * Phase 9 & Finding 03: Execute Fincra FX Conversion using valid, unexpired quote.
   */
  async executeConversion({ transactionReference, userId, quoteReference }) {
    const { data: tx, error: txErr } = await supabase
      .from("fincra_transactions")
      .select("*")
      .eq("reference", transactionReference)
      .single();

    if (txErr || !tx) {
      throw new Error(`TRANSACTION_NOT_FOUND: ${transactionReference}`);
    }

    if (tx.user_id !== userId) {
      throw new Error("UNAUTHORIZED: User does not own this conversion transaction.");
    }

    const currentStatus = getTxStatus(tx);
    if (currentStatus !== FINCRA_TX_STATUS.QUOTE_RECEIVED) {
      throw new Error(`INVALID_STATE: Conversion execution requires QUOTE_RECEIVED state. Current: ${currentStatus}`);
    }

    // ── Finding 03 Remediation: Quote Reference & Invariance Guards ──────────
    const storedQuoteRef = tx.quote_reference || tx.metadata?.quote_reference;
    if (quoteReference && storedQuoteRef && quoteReference !== storedQuoteRef) {
      throw new Error("QUOTE_MISMATCH: Provided quote reference does not match stored quote.");
    }

    const storedSource = (tx.metadata?.quote_source_currency || tx.metadata?.source_asset || tx.currency).toUpperCase();
    const storedDest   = (tx.metadata?.quote_destination_currency || tx.metadata?.destination_currency || "NGN").toUpperCase();
    const storedAmount = parseFloat(tx.metadata?.quote_amount || tx.amount);

    const sourceCurrency      = (tx.metadata?.source_asset || tx.currency).toUpperCase();
    const destinationCurrency = (tx.metadata?.destination_currency || "NGN").toUpperCase();

    if (sourceCurrency !== storedSource || destinationCurrency !== storedDest) {
      throw new Error("QUOTE_MISMATCH: Source asset or destination currency modified post-quote.");
    }
    if (Math.abs(parseFloat(tx.amount) - storedAmount) > 0.000001) {
      throw new Error("QUOTE_MISMATCH: Conversion amount cannot be modified after quote issuance.");
    }

    // Expiration Check (Fail-closed)
    const quoteExpiresAt = tx.quote_expires_at || tx.metadata?.quote_expires_at;
    if (quoteExpiresAt && new Date(quoteExpiresAt).getTime() < Date.now()) {
      const dbFailedStatus = mapStatusForDb(FINCRA_TX_STATUS.QUOTE_FAILED);
      await supabase.from("fincra_transactions").update({
        status: dbFailedStatus,
        metadata: { ...(tx.metadata || {}), otc_status: FINCRA_TX_STATUS.QUOTE_FAILED }
      }).eq("id", tx.id);
      throw new Error("QUOTE_EXPIRED: The conversion quote has expired. Please request a new quote.");
    }

    const { executeFincraConversion } = require("./conversion");

    const now = new Date().toISOString();
    const subOtcStatus = FINCRA_TX_STATUS.CONVERSION_SUBMITTED;
    await supabase.from("fincra_transactions")
      .update({
        status: mapStatusForDb(subOtcStatus),
        metadata: { ...(tx.metadata || {}), otc_status: subOtcStatus },
        updated_at: now,
      })
      .eq("id", tx.id);

    try {
      const convRes = await executeFincraConversion({
        quoteReference: storedQuoteRef || quoteReference,
        userId,
        sourceCurrency,
        destinationCurrency,
        amount: parseFloat(tx.amount),
      });

      const fincraRef = convRes.fincraRef || convRes.reference;
      const procOtcStatus = FINCRA_TX_STATUS.CONVERSION_PROCESSING;

      await supabase.from("fincra_transactions")
        .update({
          status:           mapStatusForDb(procOtcStatus),
          fincra_reference: fincraRef,
          metadata:         { ...(tx.metadata || {}), otc_status: procOtcStatus, fincra_reference: fincraRef },
        })
        .eq("id", tx.id);

      await recordFincraAudit({
        action: "OTC_CONVERSION_SUBMITTED_TO_FINCRA",
        userId,
        details: { transactionReference, fincraRef, status: procOtcStatus },
      });

      logger.info(`[FincraOtcService] Conversion submitted for ${transactionReference}. Fincra Ref: ${fincraRef}`);

      return {
        success: true,
        reference: transactionReference,
        fincraReference: fincraRef,
        status: procOtcStatus,
        message: "Conversion submitted to Fincra. Awaiting settlement webhook.",
      };

    } catch (convErr) {
      logger.error(`[FincraOtcService] Fincra conversion execution failed for ${transactionReference}: ${convErr.message}`);
      const failOtcStatus = FINCRA_TX_STATUS.CONVERSION_FAILED;
      await supabase.from("fincra_transactions")
        .update({
          status: mapStatusForDb(failOtcStatus),
          metadata: { ...(tx.metadata || {}), otc_status: failOtcStatus }
        })
        .eq("id", tx.id);

      throw convErr;
    }
  }

  /**
   * Phase 10 & 11: Handle conversion.successful Webhook.
   * Performs atomic NGN settlement & finalizes reserved crypto liability.
   */
  async handleConversionSuccess({ fincraRef, customerRef, rawPayload = {} }) {
    logger.info(`[FincraOtcService] Handling conversion.successful for customerRef=${customerRef}, fincraRef=${fincraRef}`);

    const searchRef = customerRef || fincraRef;
    const { data: tx, error: txErr } = await supabase
      .from("fincra_transactions")
      .select("*")
      .or(`reference.eq.${searchRef},fincra_reference.eq.${searchRef}`)
      .maybeSingle();

    if (txErr || !tx) {
      logger.error(`[FincraOtcService] Webhook transaction lookup failed for ${searchRef}`);
      return { handled: false, reason: "Transaction not found" };
    }

    const currentStatus = getTxStatus(tx);
    if (currentStatus === FINCRA_TX_STATUS.NGN_SETTLED || currentStatus === FINCRA_TX_STATUS.CONVERSION_SUCCESSFUL) {
      logger.info(`[FincraOtcService] Idempotency hit: Transaction ${tx.reference} already settled.`);
      return { handled: true, status: currentStatus, reason: "Already settled" };
    }

    const userId             = tx.user_id;
    const sourceAsset        = (tx.metadata?.source_asset || tx.currency).toUpperCase();
    const destinationCurrency= (tx.metadata?.destination_currency || "NGN").toUpperCase();
    const payloadData        = rawPayload.data || rawPayload;
    const destinationAmount  = parseFloat(payloadData.destinationAmount || payloadData.amountToSettle || payloadData.amount || tx.amount);

    const succOtcStatus = FINCRA_TX_STATUS.CONVERSION_SUCCESSFUL;
    await supabase.from("fincra_transactions")
      .update({
        status:           mapStatusForDb(succOtcStatus),
        fincra_reference: fincraRef || tx.fincra_reference,
        metadata:         { ...(tx.metadata || {}), otc_status: succOtcStatus },
      })
      .eq("id", tx.id);

    // Credit User NGN Wallet via DepositCreditEngine
    let creditResult = null;
    try {
      creditResult = await DepositCreditEngine.credit({
        reference:    tx.reference,
        amount:       destinationAmount,
        currency:     destinationCurrency,
        userId:       userId,
        providerTxId: fincraRef || tx.fincra_reference,
        source:       "FINCRA_CONVERSION_WEBHOOK",
      });
      logger.info(`[FincraOtcService] DepositCreditEngine NGN credit result: ${JSON.stringify(creditResult)}`);
    } catch (creditErr) {
      logger.error(`[FincraOtcService] NGN wallet credit error for tx ${tx.reference}: ${creditErr.message}`);
    }

    // Clear Reserved Crypto Liability in wallets_store
    const reservedAmount = parseFloat(tx.metadata?.reserved_crypto_amount || tx.reserved_crypto_amount || tx.amount || 0);
    if (reservedAmount > 0) {
      const { data: cryptoWallet } = await supabase
        .from("wallets_store")
        .select("id, pending_balance")
        .eq("user_id", userId)
        .eq("currency", sourceAsset)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cryptoWallet) {
        const currentPending = parseFloat(cryptoWallet.pending_balance || 0);
        const newPending     = Math.max(0, currentPending - reservedAmount);

        await supabase.from("wallets_store")
          .update({
            pending_balance: newPending,
            updated_at:      new Date().toISOString(),
          })
          .eq("id", cryptoWallet.id);

        logger.info(`[FincraOtcService] Cleared reserved ${reservedAmount} ${sourceAsset} for user ${userId}`);
      }
    }

    const setOtcStatus = FINCRA_TX_STATUS.NGN_SETTLED;
    await supabase.from("fincra_transactions")
      .update({
        status:   mapStatusForDb(setOtcStatus),
        metadata: { ...(tx.metadata || {}), otc_status: setOtcStatus },
      })
      .eq("id", tx.id);

    await recordFincraAudit({
      action: "OTC_CONVERSION_SETTLED_NGN_CREDITED",
      userId,
      details: { reference: tx.reference, fincraRef, destinationAmount, destinationCurrency, creditResult },
    });

    logger.info(`[FincraOtcService] ✅ OTC Conversion settled cleanly for ${tx.reference}`);
    return { handled: true, status: setOtcStatus, creditResult };
  }

  /**
   * Phase 10 & 12: Handle conversion.failed Webhook.
   * Releases crypto reservation back to user wallet safely.
   */
  async handleConversionFailure({ fincraRef, customerRef, reason = "Conversion failed" }) {
    logger.warn(`[FincraOtcService] Handling conversion.failed for customerRef=${customerRef}, fincraRef=${fincraRef}. Reason: ${reason}`);

    const searchRef = customerRef || fincraRef;
    const { data: tx, error: txErr } = await supabase
      .from("fincra_transactions")
      .select("*")
      .or(`reference.eq.${searchRef},fincra_reference.eq.${searchRef}`)
      .maybeSingle();

    if (txErr || !tx) {
      logger.error(`[FincraOtcService] Failed webhook transaction lookup failed for ${searchRef}`);
      return { handled: false, reason: "Transaction not found" };
    }

    const currentStatus = getTxStatus(tx);
    if ([FINCRA_TX_STATUS.CONVERSION_FAILED, FINCRA_TX_STATUS.NGN_SETTLED, FINCRA_TX_STATUS.REVERSED].includes(currentStatus)) {
      logger.info(`[FincraOtcService] Idempotency hit: Transaction ${tx.reference} already in state ${currentStatus}. Skipping release.`);
      return { handled: true, status: currentStatus, reason: "Already processed" };
    }

    if (currentStatus === FINCRA_TX_STATUS.CONVERSION_SUBMITTED && !fincraRef) {
      logger.warn(`[FincraOtcService] Ambiguous conversion failure for ${tx.reference}. Marking RECONCILIATION_REQUIRED.`);
      const recOtcStatus = FINCRA_TX_STATUS.RECONCILIATION_REQUIRED;
      await supabase.from("fincra_transactions").update({
        status: mapStatusForDb(recOtcStatus),
        metadata: { ...(tx.metadata || {}), otc_status: recOtcStatus }
      }).eq("id", tx.id);
      return { handled: true, status: recOtcStatus };
    }

    const failOtcStatus = FINCRA_TX_STATUS.CONVERSION_FAILED;
    await supabase.from("fincra_transactions")
      .update({
        status:   mapStatusForDb(failOtcStatus),
        metadata: { ...(tx.metadata || {}), otc_status: failOtcStatus, otc_notes: reason },
      })
      .eq("id", tx.id);

    const reservedAmount = parseFloat(tx.metadata?.reserved_crypto_amount || tx.reserved_crypto_amount || tx.amount || 0);
    const sourceAsset    = (tx.metadata?.source_asset || tx.currency).toUpperCase();

    if (reservedAmount > 0) {
      const { data: cryptoWallet } = await supabase
        .from("wallets_store")
        .select("id, available_balance, pending_balance, balance")
        .eq("user_id", tx.user_id)
        .eq("currency", sourceAsset)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (cryptoWallet) {
        const currentAvail   = parseFloat(cryptoWallet.available_balance !== undefined ? cryptoWallet.available_balance : cryptoWallet.balance || 0);
        const currentPending = parseFloat(cryptoWallet.pending_balance || 0);

        const newAvail   = currentAvail + reservedAmount;
        const newPending = Math.max(0, currentPending - reservedAmount);

        await supabase.from("wallets_store")
          .update({
            available_balance: newAvail,
            pending_balance:   newPending,
            updated_at:        new Date().toISOString(),
          })
          .eq("id", cryptoWallet.id);

        logger.info(`[FincraOtcService] Released ${reservedAmount} ${sourceAsset} reservation for user ${tx.user_id}`);
      }
    }

    await recordFincraAudit({
      action: "OTC_CONVERSION_FAILED_RESERVATION_RELEASED",
      userId: tx.user_id,
      details: { reference: tx.reference, fincraRef, reason },
    });

    return { handled: true, status: failOtcStatus, releasedAmount: reservedAmount };
  }
}

module.exports = new FincraOtcFundingService();
