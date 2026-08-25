/**
 * IdempotentLedgerCreditService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Authoritative, atomic engine for executing wallet credits on verified deposits.
 *
 * Guaranteed Invariants:
 *  1. NEVER allows duplicate wallet credits (Idempotency Key & Distributed Lock).
 *  2. Independent of receipt upload state (receiptStatus does not block crediting).
 *  3. Atomically updates internal ledger & wallets_store balance via confirm_deposit RPC.
 *  4. Manages full transition lifecycle of payment_status and wallet_credit_status.
 */

const supabase = require("../../config/database");
const logger = require("../../utils/logger");
const LockService = require("./LockService");

class IdempotentLedgerCreditService {
  /**
   * Idempotently credit a user's wallet for a verified payment.
   *
   * @param {Object} params
   * @param {string} params.transactionId - Primary ID of transaction record
   * @param {string} params.reference - Display reference or merchant reference
   * @param {string} [params.providerTransactionId] - External provider transaction ID
   * @param {number} [params.amount] - Deposit amount
   * @param {string} [params.currency] - Deposit currency (e.g. NGN)
   * @param {string} [params.userId] - User ID
   * @param {string} [params.source] - Trigger source (webhook, poller, admin, etc.)
   * @returns {Promise<Object>} Credit operation result
   */
  async creditWallet({
    transactionId,
    reference,
    providerTransactionId = null,
    amount = null,
    currency = null,
    userId = null,
    source = "SYSTEM_AUTOMATED",
    adminId = null,
    correlationId = null,
  }) {
    // ── DELEGATE TO THE SINGLE AUTHORITATIVE DepositCreditEngine ──────────
    // This eliminates:
    //   1. The dangerous direct wallets_store update fallback
    //   2. The swallowed confirm_deposit RPC error  
    //   3. Duplicate notification/audit/realtime logic
    const DepositCreditEngine = require('./DepositCreditEngine');
    
    const result = await DepositCreditEngine.credit({
      transactionId,
      reference,
      amount,
      currency,
      userId,
      providerTxId: providerTransactionId,
      source,
      auditMeta: { adminId, correlationId },
    });

    // Translate DepositCreditEngine's result shape to the legacy interface
    // that callers of IdempotentLedgerCreditService expect.
    if (result.error) {
      logger.error(`[IdempotentLedgerCreditService] DepositCreditEngine error: ${result.error}`);
      return {
        success: false,
        credited: false,
        error: result.error,
        transactionId: result.transactionId,
      };
    }

    return {
      success: true,
      credited: result.credited,
      alreadyCredited: result.alreadyCredited,
      transactionId: result.transactionId,
      paymentStatus: result.credited || result.alreadyCredited ? "WALLET_CREDITED" : "PENDING",
      walletCreditStatus: result.credited || result.alreadyCredited ? "WALLET_CREDITED" : "PENDING",
      amount: result.amount,
      currency: result.currency,
    };
  }

  /**
   * Idempotently reverse a previously credited deposit.
   */
  async reverseDeposit({
    transactionId,
    reference,
    currency = null,
    reason = "Provider deposit reversal",
    errorCode = "DEPOSIT_REVERSED",
    source = "SYSTEM",
    adminId = null,
  }) {
    const lockKey = reference || transactionId;
    if (!lockKey) {
      throw new Error("IdempotentLedgerCreditService: Missing reference for reversal.");
    }

    return await LockService.withLock(`credit:reverse:${lockKey}`, async () => {
      let query = supabase.from("transactions").select("*");
      if (transactionId) query = query.eq("id", transactionId);
      else if (reference) query = query.eq("reference_id", reference);

      const { data: tx, error: fetchErr } = await query.maybeSingle();
      if (fetchErr || !tx) {
        throw new Error(`[IdempotentLedgerCreditService] Transaction not found for reversal: ${lockKey}`);
      }

      if (currency && String(currency).toUpperCase() !== String(tx.currency).toUpperCase()) {
        throw new Error(`CURRENCY_MISMATCH_ERROR: Provided currency ${currency} does not match tx currency ${tx.currency}`);
      }

      if (tx.wallet_credit_status === "FAILED" || tx.payment_status === "PAYMENT_REVERSED") {
        logger.info(`[IdempotentLedgerCreditService] Reversal idempotency hit for tx ${tx.id}. Already reversed.`);
        return {
          success: true,
          alreadyReversed: true,
          reversed: false,
          transactionId: tx.id,
          walletCreditStatus: "FAILED",
        };
      }

      const targetCurrency = String(tx.currency).toUpperCase();
      const depositAmount = parseFloat(tx.amount || 0);

      const walletService = require("../walletService");
      const wallet = await walletService.createWallet(tx.user_id, targetCurrency, "native");

      const { data: currentW } = await supabase.from("wallets_store").select("*").eq("id", wallet.id).single();
      const currentBal = parseFloat(currentW.balance || 0);
      const currentAvail = parseFloat(currentW.available_balance || 0);

      let riskFlagged = false;
      if (currentAvail < depositAmount) {
        logger.warn(`[IdempotentLedgerCreditService] ⚠️ User ${tx.user_id} available balance (${currentAvail}) is less than deposit reversal amount (${depositAmount}). Routing to Exception/Risk Queue.`);
        riskFlagged = true;
      }

      const newBal = Math.max(0, currentBal - depositAmount);
      const newAvail = Math.max(0, currentAvail - depositAmount);

      await supabase.from("wallets_store").update({
        balance: newBal,
        available_balance: newAvail,
        updated_at: new Date().toISOString(),
      }).eq("id", wallet.id);

      const now = new Date().toISOString();
      const { error: txUpdErr } = await supabase.from("transactions").update({
        payment_status: "PAYMENT_REVERSED",
        wallet_credit_status: "FAILED",
        reconciliation_status: riskFlagged ? "NEGATIVE_BALANCE_RISK" : "RECONCILED",
        reconciled_at: now,
        reconciled_by: adminId || source,
        updated_at: now,
      }).eq("id", tx.id).select();

      if (txUpdErr) {
        logger.error(`[IdempotentLedgerCreditService] Failed to update transaction reversal state: ${txUpdErr.message}`);
        throw new Error(`REVERSAL_UPDATE_FAILED: ${txUpdErr.message}`);
      }

      try {
        await supabase.from("ledger_entries").insert([{
          user_id: tx.user_id,
          wallet_id: wallet.id,
          currency: targetCurrency,
          amount: depositAmount,
          balance_before: currentBal,
          balance_after: newBal,
          type: "REFUND",
          category: "REVERSAL",
          reference: tx.id,
          status: "completed",
        }]);
      } catch (e) {}

      return {
        success: true,
        reversed: true,
        alreadyReversed: false,
        transactionId: tx.id,
        newBalance: newBal,
        riskFlagged,
        walletCreditStatus: "WALLET_REVERSED",
      };
    });
  }
}

module.exports = new IdempotentLedgerCreditService();
