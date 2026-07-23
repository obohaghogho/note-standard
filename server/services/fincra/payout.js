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
  // ── STEP 1: Read user wallet balance from internal ledger ────────────────
  const { data: wallet, error: walletErr } = await supabase
    .from("wallets_v6")
    .select("id, balance, currency")
    .eq("user_id", userId)
    .eq("currency", currency)
    .maybeSingle();

  if (walletErr || !wallet) {
    throw new Error(`User wallet (${currency}) not found: ${walletErr?.message}`);
  }

  // ── STEP 2: Validate sufficient funds ────────────────────────────────────
  const available = parseFloat(wallet.balance || 0);
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

  // ── STEP 4: Reserve funds in wallets_store ───────────────────────────────
  // This prevents double-spending before the Fincra API responds.
  const { error: reserveErr } = await supabase
    .from("wallets_store")
    .update({
      balance:     supabase.rpc ? available - required : available - required,
      updated_at:  new Date().toISOString(),
    })
    .eq("id", wallet.id);

  if (reserveErr) {
    await supabase.from("fincra_transactions").update({ status: FINCRA_TX_STATUS.FAILED }).eq("reference", reference);
    throw new Error(`Failed to reserve funds in ledger: ${reserveErr.message}`);
  }

  await supabase.from("fincra_transactions").update({ status: FINCRA_TX_STATUS.RESERVED }).eq("reference", reference);
  logger.info(`[Fincra/payout] Funds reserved for user ${userId}: ${required} ${currency}`);

  // ── STEP 5: Call Fincra /disbursements/payouts ───────────────────────────
  try {
    const { instance, businessId } = getFincraClient();

    const payload = {
      sourceCurrency: currency,
      destinationCurrency: currency,
      amount: required,
      business: businessId,
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
    // ── STEP 5 FAILURE: Auto-reverse the fund reservation ─────────────────
    logger.error(`[Fincra/payout] Fincra API error. Reversing fund reservation for ${reference}: ${err.message}`);

    await supabase.from("wallets_store")
      .update({ balance: available, updated_at: new Date().toISOString() })
      .eq("id", wallet.id);

    await supabase.from("fincra_transactions")
      .update({ status: FINCRA_TX_STATUS.REVERSED, metadata: { reversal_reason: err.message } })
      .eq("reference", reference);

    await recordFincraAudit({ action: "PAYOUT_RESERVATION_REVERSED", userId, details: { reference, reason: err.message } });

    throw err;
  }
}

/**
 * Reverse a fund reservation for a failed payout.
 * Called by the webhook processor on payout.failed events.
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

  // Read current wallet balance and restore the reserved amount
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

  const restored = parseFloat(wallet.balance || 0) + parseFloat(txRecord.amount);

  await supabase.from("wallets_store")
    .update({ balance: restored, updated_at: new Date().toISOString() })
    .eq("id", wallet.id);

  await supabase.from("fincra_transactions")
    .update({ status: FINCRA_TX_STATUS.REVERSED, metadata: { ...(txRecord.metadata || {}), reversal_reason: reason } })
    .eq("reference", reference);

  await recordFincraAudit({
    action: "PAYOUT_REVERSED",
    userId: txRecord.user_id,
    details: { reference, restoredAmount: txRecord.amount, currency: txRecord.currency, reason },
  });

  logger.info(`[Fincra/payout] Reversal complete for ${reference}. Restored ${txRecord.amount} ${txRecord.currency}.`);
  return true;
}

module.exports = { initiateFincraPayout, reversePayoutReservation };
