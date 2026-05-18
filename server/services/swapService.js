const supabase = require("../config/database");
const fxService = require("./fxService");
const feeService = require("./feeService");
const logger = require("../utils/logger");
const math = require("../utils/mathUtils");

// Quote lifetime and execution buffer
const QUOTE_LOCK_TTL_MS = 120000;   // 2 min  — how long a quote lives
const QUOTE_EXEC_BUFFER_MS = 25000; // 25s    — minimum time remaining to allow execution

/**
 * Swap Service (v6.1 — Hardened Execution Layer)
 *
 * State Machine:
 *   PENDING → COMPLETED / EXPIRED  (stored in swap_quotes.status)
 *
 * Atomicity:
 *   All balance mutations are delegated to `execute_swap_v6` PostgreSQL RPC.
 *   That RPC runs a 4-leg double-entry ledger mutation inside a single
 *   DB transaction. If any leg fails, the entire transaction is rolled back.
 *   User money is NEVER at risk from partial execution.
 *
 * Idempotency:
 *   `execute_ledger_transaction_v6` (called by the RPC) checks the
 *   idempotency_key before any mutation. A duplicate key returns the
 *   existing transaction ID without re-executing.
 *
 * Liquidity Model:
 *   Internal Vault — exchanges are internal ledger math backed by
 *   authoritative live price feeds. No direct Binance/Kraken API calls.
 */
class SwapService {
  /**
   * Calculate a time-locked swap quote.
   * Validates rate freshness BEFORE writing to DB.
   */
  async calculateSwap(userId, fromCurrency, toCurrency, amount, slippage = 0.005) {
    // 1. Validate rate BEFORE writing anything
    const rateMeta = await fxService.getValidatedRate(fromCurrency, toCurrency);

    if (!rateMeta.canExecute || rateMeta.rate <= 0) {
      const reason = rateMeta.mode === 'STALE'
        ? `Price feed unavailable for ${fromCurrency}/${toCurrency}.`
        : `Price feed offline for ${fromCurrency}/${toCurrency}. Try again shortly.`;
      throw new Error(reason);
    }

    const marketPrice = rateMeta.rate;

    // 2. Referrer check for conditional fees
    const { data: profile } = await supabase
      .from("profiles")
      .select("referrer_id")
      .eq("id", userId)
      .single();
    const hasReferrer = !!profile?.referrer_id;

    const fees = feeService.calculateFees(amount, fromCurrency, hasReferrer);
    const amountOut = math.multiply(fees.netAmount, marketPrice);

    // 3. Ensure wallets exist (createWallet is idempotent)
    const walletService = require("./walletService");
    const fromWallet = await walletService.createWallet(userId, fromCurrency);
    const toWallet = await walletService.createWallet(userId, toCurrency);

    // 4. Write quote as PENDING with expiry
    const { data: quote, error } = await supabase
      .from("swap_quotes")
      .insert({
        user_id: userId,
        from_wallet_id: fromWallet.id,
        to_wallet_id: toWallet.id,
        from_amount: amount,
        to_amount: amountOut,
        from_currency: fromCurrency,
        to_currency: toCurrency,
        rate: marketPrice,
        fee: fees.totalFee,
        slippage_tolerance: slippage,
        status: "PENDING",
        expires_at: new Date(Date.now() + QUOTE_LOCK_TTL_MS).toISOString(),
        metadata: {
          fee_breakdown: fees,
          calculated_at: new Date().toISOString(),
          requested_slippage: slippage,
          price_mode: rateMeta.mode,
          price_age_seconds: rateMeta.ageSeconds || 0,
        },
      })
      .select().single();

    if (error) throw error;

    return {
      ...quote,
      lockId: quote.id,
      expiresAt: new Date(quote.expires_at).getTime(),
      feePercentage: math.multiply(math.divide(fees.totalFee, amount), 100),
      amountOut,
    };
  }

  /**
   * Execute a swap using a locked quote.
   *
   * Enforces: idempotency, quote expiry buffer, live price freshness.
   * Delegates atomic mutation to execute_swap_v6 DB RPC.
   */
  async executeSwap(userId, lockId, idempotencyKey) {
    const SystemState = require("../config/SystemState");
    if (SystemState.isSafe()) {
      throw new Error("SAFE_MODE_BLOCK: Ledger mutations disabled due to system integrity lock.");
    }

    // Fetch and lock quote
    const { data: quote, error: quoteError } = await supabase
      .from("swap_quotes")
      .select("*")
      .eq("id", lockId)
      .eq("status", "PENDING")
      .single();

    if (quoteError || !quote) {
      throw new Error("QUOTE_EXPIRED: This quote is no longer valid. Please request a new quote.");
    }

    // Pre-flight expiry check with buffer
    const msRemaining = new Date(quote.expires_at).getTime() - Date.now();

    if (msRemaining <= 0) {
      await supabase
        .from("swap_quotes")
        .update({ status: "EXPIRED" })
        .eq("id", lockId);
      throw new Error("QUOTE_EXPIRED: This quote has expired. Please request a new quote.");
    }

    if (msRemaining < QUOTE_EXEC_BUFFER_MS) {
      throw new Error(`QUOTE_EXPIRING_SOON: Only ${Math.ceil(msRemaining / 1000)}s remaining — too risky to execute. Please refresh.`);
    }

    // Live price freshness check at execution time (bypasses cache)
    const currentRateMeta = await fxService.getValidatedRate(
      quote.from_currency,
      quote.to_currency,
      false // no cache
    );

    if (!currentRateMeta.canExecute) {
      logger.error(`[SwapService] Blocked execution for ${quote.from_currency}/${quote.to_currency}. Mode: ${currentRateMeta.mode}`);
      throw new Error("Price feed unavailable: Cannot execute at this time. Please try again.");
    }

    // ── FX LIQUIDITY SAFEGUARD & TREASURY BACKSTOP ──────────────────────────
    const targetCurrency = quote.to_currency;
    const requiredAmount = Number(quote.to_amount);

    const { data: fxPool, error: fxPoolError } = await supabase
      .from("wallets_store")
      .select("id, balance")
      .eq("address", `FX_POOL_${targetCurrency}`)
      .maybeSingle();

    if (fxPoolError) {
      logger.error(`[SwapService] Failed to check FX pool balance for ${targetCurrency}:`, fxPoolError.message);
    }

    const currentBalance = fxPool ? Number(fxPool.balance) : 0;

    const BLOCK_ON_LOW_FX_LIQUIDITY = process.env.BLOCK_ON_LOW_FX_LIQUIDITY !== 'false';
    const ALLOW_TREASURY_FX_BACKSTOP = process.env.ALLOW_TREASURY_FX_BACKSTOP !== 'false';

    if (currentBalance < requiredAmount) {
      if (BLOCK_ON_LOW_FX_LIQUIDITY) {
        if (ALLOW_TREASURY_FX_BACKSTOP) {
          logger.warn(`[FX_Liquidity_Safeguard] Low liquidity in FX_POOL_${targetCurrency} (${currentBalance} < ${requiredAmount}). Triggering Treasury Backstop...`);
          const backstopSuccess = await this.triggerTreasuryBackstop(targetCurrency, requiredAmount - currentBalance);
          if (!backstopSuccess) {
            throw new Error(`Insufficient liquidity in exchange pool for ${targetCurrency}. Treasury backstop failed or reserves depleted.`);
          }
        } else {
          logger.error(`[FX_Liquidity_Safeguard] Blocked swap: FX_POOL_${targetCurrency} has insufficient balance (${currentBalance} < ${requiredAmount}) and backstop is disabled.`);
          throw new Error(`Insufficient liquidity in exchange pool for ${targetCurrency}. Swap rejected.`);
        }
      } else {
        logger.warn(`[FX_Liquidity_Safeguard] Low liquidity in FX_POOL_${targetCurrency} (${currentBalance} < ${requiredAmount}), but block is disabled. Proceeding.`);
      }
    }

    // Delegate to atomic DB RPC (handles BEGIN/COMMIT/ROLLBACK internally)
    const { data: txId, error: txError } = await supabase.rpc(
      "execute_swap_v6",
      {
        p_quote_id: lockId,
        p_current_market_rate: currentRateMeta.rate,
        p_idempotency_key: idempotencyKey,
      },
    );

    if (txError) {
      logger.error(`[SwapService] RPC error: ${txError.message}`, {
        hint: txError.hint,
        details: txError.details,
        code: txError.code,
        quoteId: lockId,
      });

      // Surface meaningful error messages to the client
      const msg = txError.message || "";
      if (msg.includes("SLIPPAGE_BREACH")) {
        throw new Error("Market moved too fast. Please get a fresh quote and try again.");
      }
      if (msg.includes("QUOTE_INVALID_OR_EXPIRED")) {
        throw new Error("QUOTE_EXPIRED: This quote has expired. Please request a new quote.");
      }
      if (msg.includes("LP_DISCOVERY_FAILURE")) {
        throw new Error("Insufficient liquidity at this time. Please try again shortly.");
      }
      if (msg.includes("JOURNAL_INTEGRITY_VIOLATION")) {
        throw new Error("Internal consistency error. Transaction was NOT processed. Contact support.");
      }
      throw new Error(msg || "Exchange failed. Please try again.");
    }

    return {
      success: true,
      transactionId: txId,
      fromCurrency: quote.from_currency,
      toCurrency: quote.to_currency,
      amountIn: quote.from_amount,
      amountOut: quote.to_amount,
      fee: quote.fee,
      rate: quote.rate,
    };
  }

  async triggerTreasuryBackstop(currency, neededAmount) {
    try {
      const { data: treasuryWallet } = await supabase
        .from("wallets_store")
        .select("id, user_id, balance")
        .eq("address", `TREASURY_${currency}`)
        .maybeSingle();

      const { data: fxPoolWallet } = await supabase
        .from("wallets_store")
        .select("id, user_id")
        .eq("address", `FX_POOL_${currency}`)
        .maybeSingle();

      if (!treasuryWallet || !fxPoolWallet) {
        logger.error(`[Backstop_${currency}] Missing system wallets. Treasury: ${!!treasuryWallet}, FX_POOL: ${!!fxPoolWallet}`);
        return false;
      }

      const treasuryBalance = Math.abs(Number(treasuryWallet.balance) || 0);
      if (treasuryBalance < neededAmount) {
        logger.error(`[Backstop_${currency}] Treasury has insufficient settled reserves (${treasuryBalance} < ${neededAmount}). Rejecting backstop.`);
        return false;
      }

      const maxAllowedFraction = 0.5;
      if (neededAmount > treasuryBalance * maxAllowedFraction) {
        logger.error(`[Backstop_${currency}] Backstop request ${neededAmount} exceeds the safety fraction of 50% of Treasury balance (${treasuryBalance}). Rejecting.`);
        return false;
      }

      const adminId = treasuryWallet.user_id;
      const idempotencyKey = `backstop_${currency}_${Date.now()}`;

      const entries = [
        {
          wallet_id: treasuryWallet.id,
          user_id: adminId,
          currency: currency,
          amount: neededAmount,
          side: 'CREDIT'
        },
        {
          wallet_id: fxPoolWallet.id,
          user_id: adminId,
          currency: currency,
          amount: -neededAmount,
          side: 'DEBIT'
        }
      ];

      const { data: txId, error: rpcError } = await supabase.rpc('execute_ledger_transaction_v6', {
        p_idempotency_key: idempotencyKey,
        p_type: 'BACKSTOP',
        p_status: 'SETTLED',
        p_metadata: {
          currency: currency,
          needed_amount: neededAmount,
          reason: 'Emergency FX Pool Liquidity Backstop',
          triggered_at: new Date().toISOString()
        },
        p_entries: entries
      });

      if (rpcError) throw rpcError;

      logger.error(`[COMPLIANCE_WARNING] [HIGH_PRIORITY_ALERT] Treasury FX Backstop triggered! Tapped Treasury_${currency} for ${neededAmount} to fund FX_POOL_${currency}. Swap transaction allowed under ALLOW_TREASURY_FX_BACKSTOP override. Ledger Tx ID: ${txId}`);

      await supabase.from("security_audit_logs").insert({
        user_id: adminId,
        event_type: "TREASURY_BACKSTOP_TAPPED",
        severity: "CRITICAL",
        description: `Treasury FX Backstop triggered! Tapped Treasury_${currency} for ${neededAmount} to fund FX_POOL_${currency}.`,
        payload: {
          currency: currency,
          amount: neededAmount,
          treasury_remaining: treasuryBalance - neededAmount,
          transaction_id: txId,
          alert_level: "HIGH"
        }
      });

      return true;
    } catch (err) {
      logger.error(`[Backstop_${currency}] Execution crashed:`, err.message);
      return false;
    }
  }
}

module.exports = new SwapService();
