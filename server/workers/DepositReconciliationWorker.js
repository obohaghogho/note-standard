/**
 * DepositReconciliationWorker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Universal, Currency-Agnostic Autonomous Deposit Reconciliation Worker.
 *
 * Scans pending/uncredited deposit transactions across ALL active currencies
 * (NGN, USD, EUR, GBP, TZS, CAD, ZAR, KES, etc.), calls provider adapters via
 * ProviderRegistry, and auto-credits verified payments idempotently.
 */

const supabase = require("../config/database");
const logger = require("../utils/logger");
const IdempotentLedgerCreditService = require("../services/payment/IdempotentLedgerCreditService");
const { registry } = require("../providers/PayoutProvider");

let intervalId = null;
const RUN_INTERVAL_MS = 60 * 1000; // Run every 60s

class DepositReconciliationWorker {
  start() {
    if (intervalId) return;
    logger.info("[DepositReconciliationWorker] Starting Universal Deposit Reconciliation Worker (60s interval)...");
    intervalId = setInterval(() => this.runReconciliationCycle(), RUN_INTERVAL_MS);
    setTimeout(() => this.runReconciliationCycle(), 5000);
  }

  stop() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      logger.info("[DepositReconciliationWorker] Stopped reconciliation worker.");
    }
  }

  async runReconciliationCycle() {
    try {
      logger.info("[DepositReconciliationWorker] Starting multi-currency deposit reconciliation cycle...");

      // 1. Fetch uncredited deposits across ALL currencies
      const { data: pendingTxs, error: fetchErr } = await supabase
        .from("transactions")
        .select("*")
        .in("type", ["DEPOSIT", "FUNDING", "COLLECTION"])
        .neq("wallet_credit_status", "WALLET_CREDITED")
        .neq("status", "COMPLETED")
        .order("created_at", { ascending: true })
        .limit(50);

      if (fetchErr) {
        logger.error(`[DepositReconciliationWorker] Failed to query pending deposit transactions: ${fetchErr.message}`);
        return;
      }

      if (!pendingTxs || pendingTxs.length === 0) {
        logger.info("[DepositReconciliationWorker] No pending deposits found requiring reconciliation across any currency.");
        return;
      }

      logger.info(`[DepositReconciliationWorker] Found ${pendingTxs.length} pending deposits across currencies to re-evaluate.`);

      for (const tx of pendingTxs) {
        await this.reconcileTransaction(tx);
      }
    } catch (err) {
      logger.error(`[DepositReconciliationWorker] Error in deposit reconciliation cycle: ${err.message}`);
    }
  }

  async reconcileTransaction(tx) {
    const searchRef = tx.reference_id || tx.provider_reference || tx.metadata?.display_ref;
    logger.info(`[DepositReconciliationWorker] Reconciling tx ${tx.id} (${tx.currency} ${tx.amount}, Ref: ${searchRef})`);

    try {
      // 2. Fetch Provider Adapter via ProviderRegistry
      const providerName = tx.provider || tx.metadata?.provider || "fincra";
      let provider;
      try {
        provider = registry.get(providerName);
      } catch (pErr) {
        provider = registry.getPrimary();
      }

      let providerConfirmed = false;
      let providerTxId = tx.provider_transaction_id;

      // Check fincra_transactions / provider transaction table first
      const { data: provTx } = await supabase
        .from("fincra_transactions")
        .select("id, fincra_reference, status, amount, currency")
        .or(`reference.eq.${searchRef},fincra_reference.eq.${searchRef},metadata->>merchantReference.eq.${searchRef},metadata->>customerReference.eq.${searchRef}`)
        .maybeSingle();

      if (provTx && (provTx.status === "SUCCESSFUL" || provTx.status === "COMPLETED")) {
        // Enforce strict currency matching
        if (String(provTx.currency).toUpperCase() === String(tx.currency).toUpperCase()) {
          providerConfirmed = true;
          providerTxId = provTx.fincra_reference || providerTxId;
        }
      }

      // If not confirmed in DB, attempt live provider API query if adapter exists
      if (!providerConfirmed && provider && typeof provider.getPayoutStatus === "function") {
        try {
          const apiStatus = await provider.getPayoutStatus(searchRef);
          if (apiStatus && (apiStatus.status === "SUCCESSFUL" || apiStatus.status === "COMPLETED")) {
            if (String(apiStatus.currency || tx.currency).toUpperCase() === String(tx.currency).toUpperCase()) {
              providerConfirmed = true;
              providerTxId = apiStatus.rawResponse?.data?.reference || providerTxId;
            }
          }
        } catch (apiErr) {
          logger.warn(`[DepositReconciliationWorker] Provider API status query error for ${searchRef}: ${apiErr.message}`);
        }
      }

      // 3. Auto-Credit or Flag Unmatched Exception
      if (providerConfirmed) {
        logger.info(`[DepositReconciliationWorker] Provider SUCCESS verified for ${searchRef} (${tx.currency} ${tx.amount}). Executing IdempotentLedgerCreditService...`);

        const creditRes = await IdempotentLedgerCreditService.creditWallet({
          transactionId: tx.id,
          reference: searchRef,
          providerTransactionId: providerTxId,
          amount: tx.amount,
          currency: tx.currency,
          userId: tx.user_id,
          source: "DEPOSIT_RECONCILIATION_WORKER",
        });

        logger.info(`[DepositReconciliationWorker] ✅ AUTO-RECONCILED & CREDITED deposit ${searchRef}: ${JSON.stringify(creditRes)}`);
      } else {
        // Check if transaction is stuck > 15 mins without provider confirmation
        const createdAt = new Date(tx.created_at || Date.now());
        const ageMins = (Date.now() - createdAt.getTime()) / (1000 * 60);

        if (ageMins > 15 && tx.reconciliation_status !== "UNMATCHED_SUCCESSFUL_DEPOSIT") {
          logger.warn(`[DepositReconciliationWorker] ⚠️ Flagging deposit ${searchRef} (${tx.currency} ${tx.amount}) as UNMATCHED_SUCCESSFUL_DEPOSIT for Admin Queue`);

          await supabase
            .from("transactions")
            .update({
              reconciliation_status: "UNMATCHED_SUCCESSFUL_DEPOSIT",
              payment_status: "PENDING_PROVIDER_VERIFICATION",
              updated_at: new Date().toISOString(),
            })
            .eq("id", tx.id);
        }
      }
    } catch (txErr) {
      logger.error(`[DepositReconciliationWorker] Failed to reconcile deposit tx ${tx.id}: ${txErr.message}`);
    }
  }
}

module.exports = new DepositReconciliationWorker();
