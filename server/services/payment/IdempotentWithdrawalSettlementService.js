/**
 * IdempotentWithdrawalSettlementService.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Universal, Currency-Agnostic, Enterprise Idempotent Withdrawal Settlement Service.
 *
 * SAFETY INVARIANTS:
 * 1. STRICT CURRENCY SAFETY: Wallet currency == Requested currency == Provider currency.
 *    Cross-currency arithmetic or ledger debiting is strictly prohibited.
 * 2. BALANCE RESERVATION PROTOCOL:
 *    - Initiation: reserve_for_withdrawal (available_balance -> reserved_balance).
 *    - Failure/Reversal: reverse_withdrawal_reservation (reserved_balance -> available_balance).
 *    - Provider SUCCESS: complete_withdrawal (deducts total balance and reserved_balance).
 * 3. IDEMPOTENCY & CONCURRENCY:
 *    - Uses LockService distributed mutex and database FOR UPDATE row locking.
 *    - Duplicate webhooks, worker cycles, or admin approvals cause ZERO duplicate debits.
 */

const supabase = require("../../config/database");
const logger = require("../../utils/logger");
const LockService = require("./LockService");

class IdempotentWithdrawalSettlementService {
  /**
   * 1. ATOMIC FUND RESERVATION
   * Moves available_balance -> reserved_balance.
   */
  async reserveFunds({
    transactionId,
    reference,
    userId,
    currency = null,
    amount,
    fee = 0,
    source = "SYSTEM",
  }) {
    const lockKey = reference || transactionId;

    return await LockService.withLock(`withdrawal:reserve:${lockKey}`, async () => {
      // 1. Fetch transaction record
      let query = supabase.from("fincra_transactions").select("*");
      if (transactionId) query = query.eq("id", transactionId);
      else query = query.or(`reference.eq.${reference},withdrawal_reference.eq.${reference}`);

      const { data: tx, error: fetchErr } = await query.maybeSingle();

      if (fetchErr || !tx) {
        throw new Error(`[IdempotentWithdrawalSettlementService] Transaction not found for ${lockKey}`);
      }

      // Check idempotency
      if (tx.funds_status === "RESERVED" || tx.funds_status === "DEBITED") {
        logger.info(`[IdempotentWithdrawalSettlementService] Funds already reserved/debited for tx ${tx.id}`);
        return { success: true, alreadyReserved: true, tx };
      }

      // 2. Strict Currency Validation
      const targetCurrency = String(currency || tx.currency || "NGN").toUpperCase();
      const targetUserId = userId || tx.user_id;

      const walletService = require("../walletService");
      const wallet = await walletService.createWallet(targetUserId, targetCurrency, "native");

      if (!wallet || !wallet.id) {
        throw new Error(`[IdempotentWithdrawalSettlementService] User wallet not found for ${targetCurrency}`);
      }

      // Verify wallet currency matches requested currency strictly
      if (String(wallet.currency).toUpperCase() !== targetCurrency) {
        throw new Error(`CURRENCY_MISMATCH_ERROR: Wallet currency (${wallet.currency}) does not match withdrawal currency (${targetCurrency})`);
      }

      const totalDeduction = parseFloat(amount || tx.amount || 0) + parseFloat(fee || tx.fee || 0);

      if (totalDeduction <= 0) {
        throw new Error(`[IdempotentWithdrawalSettlementService] Invalid total deduction amount: ${totalDeduction}`);
      }

      // 3. Execute Atomic RPC reserve_for_withdrawal
      logger.info(`[IdempotentWithdrawalSettlementService] Reserving ${totalDeduction} ${targetCurrency} for tx ${tx.id}`);

      const { error: rpcErr } = await supabase.rpc("reserve_for_withdrawal", {
        p_wallet_id: wallet.id,
        p_amount: totalDeduction,
      });

      if (rpcErr) {
        logger.error(`[IdempotentWithdrawalSettlementService] RPC reserve_for_withdrawal failed for tx ${tx.id}: ${rpcErr.message}`);
        throw new Error(`RESERVATION_FAILED: ${rpcErr.message}`);
      }

      // 4. Update multi-state machine
      const now = new Date().toISOString();
      const { data: updatedTx } = await supabase
        .from("fincra_transactions")
        .update({
          status: "RESERVED",
          withdrawal_status: "VALIDATED",
          funds_status: "RESERVED",
          updated_at: now,
        })
        .eq("id", tx.id)
        .select()
        .single();

      // Audit Log
      await supabase.from("banking_audit_logs").insert({
        user_id: targetUserId,
        action: "WITHDRAWAL_FUNDS_RESERVED",
        provider: tx.provider_name || "fincra",
        new_values: {
          reference: tx.reference,
          amount: totalDeduction,
          currency: targetCurrency,
          source,
        },
        correlation_id: tx.correlation_id || `CORR_${Date.now()}`,
      });

      return {
        success: true,
        reserved: true,
        transactionId: tx.id,
        currency: targetCurrency,
        amount: totalDeduction,
        tx: updatedTx || tx,
      };
    });
  }

  /**
   * 2. ATOMIC SETTLEMENT ON PROVIDER SUCCESS
   * Deducts total balance and reserved_balance.
   */
  async finalizeSettlement({
    transactionId,
    reference,
    providerTransactionId,
    userId,
    currency = null,
    amount,
    fee = 0,
    source = "SYSTEM",
    adminId = null,
  }) {
    const lockKey = reference || transactionId;

    return await LockService.withLock(`withdrawal:settle:${lockKey}`, async () => {
      // 1. Fetch transaction record
      let query = supabase.from("fincra_transactions").select("*");
      if (transactionId) query = query.eq("id", transactionId);
      else query = query.or(`reference.eq.${reference},withdrawal_reference.eq.${reference}`);

      const { data: tx, error: fetchErr } = await query.maybeSingle();

      if (fetchErr || !tx) {
        throw new Error(`[IdempotentWithdrawalSettlementService] Transaction not found for ${lockKey}`);
      }

      // Idempotency check: Already debited or completed?
      if (tx.funds_status === "DEBITED" || tx.withdrawal_status === "COMPLETED" || tx.status === "SUCCESSFUL") {
        logger.info(`[IdempotentWithdrawalSettlementService] Idempotency Hit for tx ${tx.id}. Already debited.`);
        return {
          success: true,
          alreadyDebited: true,
          debited: false,
          transactionId: tx.id,
          withdrawalStatus: "COMPLETED",
          fundsStatus: "DEBITED",
        };
      }

      // 2. Strict Currency Validation
      if (currency && String(currency).toUpperCase() !== String(tx.currency).toUpperCase()) {
        throw new Error(`CURRENCY_MISMATCH_ERROR: Provided currency ${currency} does not match transaction currency ${tx.currency}`);
      }

      const targetCurrency = String(tx.currency).toUpperCase();
      const targetUserId = userId || tx.user_id;

      const walletService = require("../walletService");
      const wallet = await walletService.createWallet(targetUserId, targetCurrency, "native");

      if (!wallet || !wallet.id) {
        throw new Error(`[IdempotentWithdrawalSettlementService] User wallet not found for ${targetCurrency}`);
      }

      if (String(wallet.currency).toUpperCase() !== targetCurrency) {
        throw new Error(`CURRENCY_MISMATCH_ERROR: Wallet currency (${wallet.currency}) does not match transaction currency (${targetCurrency})`);
      }

      const totalDeduction = parseFloat(amount || tx.amount || 0) + parseFloat(fee || tx.fee || 0);

      // 3. Execute 100% Atomic DB RPC (combines balance debit + status transition in ONE SQL transaction)
      logger.info(`[IdempotentWithdrawalSettlementService] Finalizing debit of ${totalDeduction} ${targetCurrency} for tx ${tx.id} via atomic RPC`);

      const { data: atomicRes, error: atomicErr } = await supabase.rpc("atomic_finalize_withdrawal_settlement", {
        p_transaction_id: tx.id,
        p_wallet_id: wallet.id,
        p_amount: totalDeduction,
        p_provider_ref: providerTransactionId || tx.fincra_reference || reference,
        p_source: source,
        p_admin_id: adminId
      });

      if (atomicRes && atomicRes.success) {
        if (atomicRes.already_debited) {
          logger.info(`[IdempotentWithdrawalSettlementService] Idempotency Hit for tx ${tx.id}. Already debited.`);
          return {
            success: true,
            alreadyDebited: true,
            debited: false,
            transactionId: tx.id,
            withdrawalStatus: "COMPLETED",
            fundsStatus: "DEBITED",
          };
        }
        logger.info(`[IdempotentWithdrawalSettlementService] ✅ Atomic settlement RPC succeeded for tx ${tx.id}`);
      } else {
        // Fallback for non-migrated environment
        logger.warn(`[IdempotentWithdrawalSettlementService] atomic_finalize_withdrawal_settlement RPC fallback: ${atomicErr?.message}`);

        const { error: rpcErr } = await supabase.rpc("complete_withdrawal", {
          p_wallet_id: wallet.id,
          p_amount: totalDeduction,
        });

        if (rpcErr) {
          await supabase
            .from("wallets_store")
            .update({
              balance: wallet.balance - totalDeduction,
              reserved_balance: Math.max(0, (wallet.reserved_balance || 0) - totalDeduction),
              updated_at: new Date().toISOString(),
            })
            .eq("id", wallet.id);
        }

        const now = new Date().toISOString();
        await supabase
          .from("fincra_transactions")
          .update({
            status: "SUCCESSFUL",
            withdrawal_status: "COMPLETED",
            funds_status: "DEBITED",
            provider_status: "SUCCESS",
            reconciliation_status: source.includes("ADMIN") || source.includes("RECONCILIATION") ? "RECONCILED" : "NONE",
            fincra_reference: providerTransactionId || tx.fincra_reference || reference,
            reconciled_at: now,
            reconciled_by: adminId || source,
            updated_at: now,
          })
          .eq("id", tx.id);
      }

      // Also update primary transactions table if reference exists
      await supabase.from("transactions")
        .update({
          status: "COMPLETED",
          payment_status: "PAYMENT_CONFIRMED",
          wallet_credit_status: "WALLET_CREDITED",
        })
        .or(`reference_id.eq.${tx.reference},idempotency_key.eq.${tx.reference}`);

      // Post explicit double-entry ledger records for withdrawal net amount and fee
      const netAmt = parseFloat(tx.net_amount || tx.amount || 0);
      const feeAmt = parseFloat(tx.fee || 0);

      try {
        const balBefore = parseFloat(wallet.balance || 0);
        const { error: legErr } = await supabase.from("ledger_entries").insert([
          {
            user_id: targetUserId,
            wallet_id: wallet.id,
            currency: targetCurrency,
            amount: totalDeduction,
            balance_before: balBefore,
            balance_after: balBefore - totalDeduction,
            type: "WITHDRAWAL",
            category: "WITHDRAWAL",
            reference: tx.id,
            status: "completed",
          },
        ]);
        if (legErr) {
          logger.error(`[IdempotentWithdrawalSettlementService] Ledger entry insert error: ${JSON.stringify(legErr)}`);
        }
      } catch (lErr) {
        logger.error(`[IdempotentWithdrawalSettlementService] Ledger entry warning: ${lErr.message}`);
      }

      // 5. Immutable Audit Logs
      await supabase.from("banking_audit_logs").insert({
        user_id: targetUserId,
        admin_id: adminId,
        action: "WITHDRAWAL_SETTLED_FINAL",
        provider: tx.provider_name || "fincra",
        previous_values: {
          withdrawal_status: tx.withdrawal_status,
          funds_status: tx.funds_status,
        },
        new_values: {
          withdrawal_status: "COMPLETED",
          funds_status: "DEBITED",
          provider_status: "SUCCESS",
          debited_amount: totalDeduction,
          currency: targetCurrency,
          source,
        },
        correlation_id: tx.correlation_id || `CORR_${Date.now()}`,
      });

      // 6. User Realtime Event & Notification
      try {
        const realtimeService = require("../realtimeService");
        if (realtimeService && typeof realtimeService.emitToUser === "function") {
          await realtimeService.emitToUser(targetUserId, "wallet_updated", {
            type: "WITHDRAWAL_COMPLETED",
            amount: totalDeduction,
            currency: targetCurrency,
            reference: tx.reference,
            status: "COMPLETED",
          });
        }

        const notificationService = require("../notificationService");
        if (notificationService && typeof notificationService.createNotification === "function") {
          await notificationService.createNotification({
            receiverId: targetUserId,
            type: "WITHDRAWAL_SETTLED",
            title: "Withdrawal Successful",
            message: `Your withdrawal of ${targetCurrency} ${totalDeduction.toLocaleString()} has been processed successfully.`,
            link: "/dashboard/wallet",
            skipPush: true,
          });
        }
      } catch (notifyErr) {
        logger.warn(`[IdempotentWithdrawalSettlementService] Notification warning: ${notifyErr.message}`);
      }

      return {
        success: true,
        debited: true,
        alreadyDebited: false,
        transactionId: tx.id,
        withdrawalStatus: "COMPLETED",
        fundsStatus: "DEBITED",
        providerStatus: "SUCCESS",
        amount: totalDeduction,
        currency: targetCurrency,
      };
    });
  }

  /**
   * 3. ATOMIC REVERSAL ON PROVIDER FAILURE / REJECTION
   * Moves reserved_balance -> available_balance.
   */
  async reverseReservation({
    transactionId,
    reference,
    userId,
    currency = null,
    amount,
    fee = 0,
    reason = "Withdrawal failed",
    errorCode = "PROVIDER_FAILED",
    source = "SYSTEM",
    adminId = null,
  }) {
    const lockKey = reference || transactionId;

    return await LockService.withLock(`withdrawal:reverse:${lockKey}`, async () => {
      // 1. Fetch transaction record
      let query = supabase.from("fincra_transactions").select("*");
      if (transactionId) query = query.eq("id", transactionId);
      else query = query.or(`reference.eq.${reference},withdrawal_reference.eq.${reference}`);

      const { data: tx, error: fetchErr } = await query.maybeSingle();

      if (fetchErr || !tx) {
        throw new Error(`[IdempotentWithdrawalSettlementService] Transaction not found for ${lockKey}`);
      }

      // Idempotency check: Already released/reversed?
      if (tx.funds_status === "RELEASED" || tx.withdrawal_status === "REVERSED" || tx.status === "REVERSED") {
        logger.info(`[IdempotentWithdrawalSettlementService] Idempotency Hit for tx ${tx.id}. Funds already released.`);
        return {
          success: true,
          alreadyReleased: true,
          released: false,
          transactionId: tx.id,
          withdrawalStatus: "REVERSED",
          fundsStatus: "RELEASED",
        };
      }

      // 2. Strict Currency Validation
      const targetCurrency = String(currency || tx.currency || "NGN").toUpperCase();
      const targetUserId = userId || tx.user_id;

      const walletService = require("../walletService");
      const wallet = await walletService.createWallet(targetUserId, targetCurrency, "native");

      if (!wallet || !wallet.id) {
        throw new Error(`[IdempotentWithdrawalSettlementService] User wallet not found for ${targetCurrency}`);
      }

      if (String(wallet.currency).toUpperCase() !== targetCurrency) {
        throw new Error(`CURRENCY_MISMATCH_ERROR: Wallet currency (${wallet.currency}) does not match transaction currency (${targetCurrency})`);
      }

      const totalDeduction = parseFloat(amount || tx.amount || 0) + parseFloat(fee || tx.fee || 0);

      // 3. Execute 100% Atomic DB RPC (combines balance restore + status transition in ONE SQL transaction)
      logger.info(`[IdempotentWithdrawalSettlementService] Reversing fund reservation of ${totalDeduction} ${targetCurrency} for tx ${tx.id} via atomic RPC`);

      const { data: atomicRes, error: atomicErr } = await supabase.rpc("atomic_reverse_withdrawal_reservation", {
        p_transaction_id: tx.id,
        p_wallet_id: wallet.id,
        p_amount: totalDeduction,
        p_reason: reason,
        p_error_code: errorCode,
        p_source: source,
        p_admin_id: adminId
      });

      if (atomicRes && atomicRes.success) {
        if (atomicRes.already_released) {
          logger.info(`[IdempotentWithdrawalSettlementService] Idempotency Hit for tx ${tx.id}. Funds already released.`);
          return {
            success: true,
            alreadyReleased: true,
            released: false,
            transactionId: tx.id,
            withdrawalStatus: "REVERSED",
            fundsStatus: "RELEASED",
          };
        }
        logger.info(`[IdempotentWithdrawalSettlementService] ✅ Atomic reversal RPC succeeded for tx ${tx.id}`);
      } else {
        // Fallback for non-migrated environment
        logger.warn(`[IdempotentWithdrawalSettlementService] atomic_reverse_withdrawal_reservation RPC fallback: ${atomicErr?.message}`);

        const { error: rpcErr } = await supabase.rpc("reverse_withdrawal_reservation", {
          p_wallet_id: wallet.id,
          p_amount: totalDeduction,
        });

        if (rpcErr) {
          await supabase
            .from("wallets_store")
            .update({
              available_balance: wallet.available_balance + totalDeduction,
              reserved_balance: Math.max(0, (wallet.reserved_balance || 0) - totalDeduction),
              updated_at: new Date().toISOString(),
            })
            .eq("id", wallet.id);
        }

        const now = new Date().toISOString();
        await supabase
          .from("fincra_transactions")
          .update({
            status: "REVERSED",
            withdrawal_status: "REVERSED",
            funds_status: "RELEASED",
            provider_status: "FAILED",
            error_code: errorCode,
            error_message: reason,
            reconciled_at: now,
            reconciled_by: adminId || source,
            updated_at: now,
          })
          .eq("id", tx.id);
      }

      if (!updatedTx) {
        logger.info(`[IdempotentWithdrawalSettlementService] Concurrent reversal check for tx ${tx.id}. Already released.`);
        return {
          success: true,
          alreadyReleased: true,
          released: false,
          transactionId: tx.id,
        };
      }

      // 5. Immutable Audit Logs
      await supabase.from("banking_audit_logs").insert({
        user_id: targetUserId,
        admin_id: adminId,
        action: "WITHDRAWAL_RESERVATION_REVERSED",
        provider: tx.provider_name || "fincra",
        previous_values: {
          withdrawal_status: tx.withdrawal_status,
          funds_status: tx.funds_status,
        },
        new_values: {
          withdrawal_status: "REVERSED",
          funds_status: "RELEASED",
          provider_status: "FAILED",
          restored_amount: totalDeduction,
          currency: targetCurrency,
          reason,
          source,
        },
        correlation_id: tx.correlation_id || `CORR_${Date.now()}`,
      });

      // 6. User Notification
      try {
        const notificationService = require("../notificationService");
        if (notificationService && typeof notificationService.createNotification === "function") {
          await notificationService.createNotification({
            receiverId: targetUserId,
            type: "WITHDRAWAL_FAILED",
            title: "Withdrawal Failed - Funds Returned",
            message: `Your withdrawal of ${targetCurrency} ${totalDeduction.toLocaleString()} could not be completed. Reason: ${reason}. Funds have been restored to your available balance.`,
            link: "/dashboard/wallet",
            skipPush: true,
          });
        }
      } catch (notifyErr) {
        logger.warn(`[IdempotentWithdrawalSettlementService] Notification warning: ${notifyErr.message}`);
      }

      return {
        success: true,
        released: true,
        alreadyReleased: false,
        transactionId: tx.id,
        withdrawalStatus: "REVERSED",
        fundsStatus: "RELEASED",
        providerStatus: "FAILED",
        restoredAmount: totalDeduction,
        currency: targetCurrency,
      };
    });
  }
}

module.exports = new IdempotentWithdrawalSettlementService();
