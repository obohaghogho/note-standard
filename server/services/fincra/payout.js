/**
 * Fincra Integration — Payout / Withdrawal Service
 * ─────────────────────────────────────────────────
 * Manages outbound bank transfer lifecycle (NGN/USD/EUR).
 *
 * SAFETY INVARIANTS:
 *   1. User wallet balance is checked BEFORE any payout request.
 *   2. Funds are reserved in the NoteStandard ledger BEFORE calling Fincra.
 *   3. If the Fincra API call fails, the reservation is reversed immediately.
 *   4. If the payout.failed webhook arrives, the reservation is reversed.
 *   5. Funds are NEVER permanently removed until payout.successful is received.
 *
 * Crypto assets (BTC, ETH, USDT, USDC) are NEVER connected to this module.
 */

const supabase             = require("../../config/database");
const { getFincraClient }  = require("./client");
const { recordFincraAudit } = require("./audit");
const { FINCRA_TX_STATUS, FINCRA_TX_TYPES } = require("./constants");
const { FincraInsufficientFundsError, FincraApiError } = require("./errors");
const logger = require("../../utils/logger");
const { v4: uuidv4 } = require("uuid");

/**
 * Initiate a Fincra bank payout (withdrawal).
 *
 * Flow:
 *  1. Read user wallet balance from wallets_v6 (internal ledger truth).
 *  2. Validate funds are sufficient.
 *  3. Create fincra_transactions record (status: CREATED).
 *  4. Reserve funds in wallets_store (status: RESERVED).
 *  5. Call Fincra /disbursements/payouts API.
 *  6. Update record to PENDING.
 *  7. Wait for payout.successful / payout.failed webhook.
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {number} params.amount
 * @param {string} params.currency      - NGN | USD | EUR
 * @param {string} params.bankCode
 * @param {string} params.accountNumber
 * @param {string} params.accountName   - Must be verified before calling this
 * @param {string} params.narration     - Transfer description
 */
async function initiateFincraPayout({ userId, amount, currency, bankCode, accountNumber, accountName, narration }) {
  // ── STEP 1: Read user wallet available_balance from internal ledger ─────
  const { data: wallet, error: walletErr } = await supabase
    .from("wallets_v6")
    .select("id, balance, available_balance, currency")
    .eq("user_id", userId)
    .eq("currency", currency)
    .maybeSingle();

  if (walletErr || !wallet) {
    throw new Error(`User wallet (${currency}) not found: ${walletErr?.message}`);
  }

  // ── STEP 2: Validate available_balance ONLY (never pending or reserved) ──
  const available = parseFloat(wallet.available_balance || 0);
  const required  = parseFloat(amount);
  if (available < required) {
    throw new FincraInsufficientFundsError(available, required, currency);
  }

  // ── STEP 3: Create fincra_transactions record ────────────────────────────
  const reference = `FIN_PAYOUT_${uuidv4()}`;
  const { data: txRecord, error: txErr } = await supabase
    .from("fincra_transactions")
    .insert({
      user_id:   userId,
      reference,
      type:      FINCRA_TX_TYPES.WITHDRAWAL,
      currency,
      amount:    required,
      status:    FINCRA_TX_STATUS.CREATED,
      metadata:  { bankCode, accountNumber, accountName, narration },
    })
    .select()
    .single();

  if (txErr) throw new Error(`Failed to create Fincra payout record: ${txErr.message}`);

  await recordFincraAudit({ action: "PAYOUT_INITIATED", userId, details: { reference, amount: required, currency } });

  // ── STEP 4: Reserve funds via atomic RPC (reserve_for_withdrawal) ─────────
  // Moves available_balance -> reserved_balance atomically with row lock
  const { data: remAvail, error: reserveErr } = await supabase.rpc('reserve_for_withdrawal', {
    p_wallet_id: wallet.id,
    p_amount: required,
  });

  if (reserveErr) {
    await supabase.from("fincra_transactions").update({ status: FINCRA_TX_STATUS.FAILED }).eq("reference", reference);
    throw new Error(`Failed to reserve funds in ledger: ${reserveErr.message}`);
  }

  await supabase.from("fincra_transactions").update({ status: FINCRA_TX_STATUS.RESERVED }).eq("reference", reference);
  logger.info(`[Fincra/payout] Funds reserved for user ${userId}: ${required} ${currency}. Remaining available: ${remAvail}`);

  // Notify user: Withdrawal Initiated
  try {
    const notificationService = require("../notificationService");
    await notificationService.sendNotification(userId, {
      type: 'WITHDRAWAL_INITIATED',
      title: 'Withdrawal Initiated',
      message: `Withdrawal of ${currency} ${required.toLocaleString()} initiated to ${accountNumber} (${accountName}).`,
      data: { reference, amount: required, currency, bankCode },
    });
  } catch (nErr) {
    logger.warn(`[Fincra/payout] Notification warning: ${nErr.message}`);
  }

  // ── STEP 5: Call Fincra /disbursements/payouts ───────────────────────────
  try {
    const { instance, businessId } = getFincraClient();

    const payload = {
      sourceCurrency: currency,
      destinationCurrency: currency,
      amount: required,
      description: narration || `NoteStandard withdrawal ${reference}`,
      customerReference: reference,
      beneficiary: {
        name:          accountName,
        accountNumber,
        type:          "individual",
        bankCode,
      },
    };

    const res = await instance.post("/disbursements/payouts", payload);
    const fincraRef = res.data?.data?.reference || res.data?.data?.id;

    await supabase.from("fincra_transactions")
      .update({ status: FINCRA_TX_STATUS.PENDING, fincra_reference: fincraRef })
      .eq("reference", reference);

    await recordFincraAudit({ action: "PAYOUT_SUBMITTED_TO_FINCRA", userId, details: { reference, fincraRef } });

    logger.info(`[Fincra/payout] Payout submitted to Fincra. Reference: ${reference}, Fincra Ref: ${fincraRef}`);
    return { reference, fincraRef, status: FINCRA_TX_STATUS.PENDING };

  } catch (err) {
    // ── STEP 5 FAILURE: Auto-reverse the fund reservation via RPC ──────────
    logger.error(`[Fincra/payout] Fincra API error. Reversing fund reservation for ${reference}: ${err.message}`);

    await supabase.rpc('reverse_withdrawal_reservation', {
      p_wallet_id: wallet.id,
      p_amount: required,
    }).catch(revErr => logger.error(`[Fincra/payout] RPC reverse_withdrawal_reservation error: ${revErr.message}`));

    await supabase.from("fincra_transactions")
      .update({ status: FINCRA_TX_STATUS.REVERSED, metadata: { reversal_reason: err.message } })
      .eq("reference", reference);

    await recordFincraAudit({ action: "PAYOUT_RESERVATION_REVERSED", userId, details: { reference, reason: err.message } });

    // Notify user: Withdrawal Failed / Returned
    try {
      const notificationService = require("../notificationService");
      await notificationService.sendNotification(userId, {
        type: 'WITHDRAWAL_FAILED',
        title: 'Withdrawal Failed - Funds Returned',
        message: `Your withdrawal of ${currency} ${required.toLocaleString()} could not be processed. Funds have been returned to your available balance.`,
        data: { reference, amount: required, currency, reason: err.message },
      });
    } catch (nErr) {
      logger.warn(`[Fincra/payout] Notification warning: ${nErr.message}`);
    }

    throw err;
  }
}

/**
 * Finalize payout debit upon payout.successful webhook.
 * Calls complete_withdrawal RPC (deducts total balance, since available was already reduced).
 */
async function completePayoutDebit(reference) {
  const { data: txRecord, error } = await supabase
    .from("fincra_transactions")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();

  if (error || !txRecord) {
    logger.error(`[Fincra/payout] Cannot complete debit — transaction not found: ${reference}`);
    return false;
  }

  const { data: wallet } = await supabase
    .from("wallets_v6")
    .select("id")
    .eq("user_id", txRecord.user_id)
    .eq("currency", txRecord.currency)
    .maybeSingle();

  if (!wallet) return false;

  const { error: rpcErr } = await supabase.rpc('complete_withdrawal', {
    p_wallet_id: wallet.id,
    p_amount: parseFloat(txRecord.amount),
  });

  if (rpcErr) {
    logger.error(`[Fincra/payout] RPC complete_withdrawal error: ${rpcErr.message}`);
    return false;
  }

  // Notify user: Withdrawal Completed
  try {
    const notificationService = require("../notificationService");
    await notificationService.sendNotification(txRecord.user_id, {
      type: 'WITHDRAWAL_COMPLETED',
      title: 'Withdrawal Completed',
      message: `Your withdrawal of ${txRecord.currency} ${parseFloat(txRecord.amount).toLocaleString()} was processed successfully.`,
      data: { reference, amount: txRecord.amount, currency: txRecord.currency },
    });
  } catch (nErr) {
    logger.warn(`[Fincra/payout] Notification warning: ${nErr.message}`);
  }

  return true;
}

/**
 * Reverse a fund reservation for a failed payout.
 * Called by the webhook processor on payout.failed events or by timeout worker.
 *
 * @param {string} reference - The NoteStandard-side reference
 * @param {string} reason
 */
async function reversePayoutReservation(reference, reason = "Payout failed") {
  const { data: txRecord, error } = await supabase
    .from("fincra_transactions")
    .select("*")
    .eq("reference", reference)
    .maybeSingle();

  if (error || !txRecord) {
    logger.error(`[Fincra/payout] Cannot reverse — transaction not found: ${reference}`);
    return false;
  }

  if (txRecord.status === FINCRA_TX_STATUS.REVERSED) {
    logger.warn(`[Fincra/payout] Transaction ${reference} already reversed.`);
    return true;
  }

  const { data: wallet } = await supabase
    .from("wallets_v6")
    .select("id, balance")
    .eq("user_id", txRecord.user_id)
    .eq("currency", txRecord.currency)
    .maybeSingle();

  if (!wallet) {
    logger.error(`[Fincra/payout] Cannot reverse — wallet not found for user ${txRecord.user_id}`);
    return false;
  }

  const amount = parseFloat(txRecord.amount);

  const { error: rpcErr } = await supabase.rpc('reverse_withdrawal_reservation', {
    p_wallet_id: wallet.id,
    p_amount: amount,
  });

  if (rpcErr) {
    logger.error(`[Fincra/payout] RPC reverse_withdrawal_reservation error: ${rpcErr.message}`);
    // Fallback
    const restored = parseFloat(wallet.available_balance || 0) + amount;
    await supabase.from("wallets_store")
      .update({ available_balance: restored, updated_at: new Date().toISOString() })
      .eq("id", wallet.id);
  }

  await supabase.from("fincra_transactions")
    .update({ status: FINCRA_TX_STATUS.REVERSED, metadata: { ...(txRecord.metadata || {}), reversal_reason: reason } })
    .eq("reference", reference);

  await recordFincraAudit({
    action: "PAYOUT_REVERSED",
    userId: txRecord.user_id,
    details: { reference, restoredAmount: amount, currency: txRecord.currency, reason },
  });

  logger.info(`[Fincra/payout] Reversal complete for ${reference}. Restored ${amount} ${txRecord.currency}.`);

  // Notify user: Withdrawal Reversed
  try {
    const notificationService = require("../notificationService");
    await notificationService.sendNotification(txRecord.user_id, {
      type: 'WITHDRAWAL_FAILED',
      title: 'Withdrawal Failed - Funds Returned',
      message: `Your withdrawal of ${txRecord.currency} ${amount.toLocaleString()} failed (${reason}). Reserved funds have been returned to your available balance.`,
      data: { reference, amount, currency: txRecord.currency, reason },
    });
  } catch (nErr) {
    logger.warn(`[Fincra/payout] Notification warning: ${nErr.message}`);
  }

  return true;
}

module.exports = { initiateFincraPayout, reversePayoutReservation, completePayoutDebit };
