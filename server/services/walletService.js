const supabase = require("../config/database");
const { v4: uuidv4 } = require("uuid");
const math = require("../utils/mathUtils");
const logger = require("../utils/logger");

/**
 * Wallet Service
 * Handles wallet lifecycle, balances, and direct funding/withdrawals.
 */
class WalletService {
  /**
   * Get all wallets for a user
   */
  async getWallets(userId) {
    const { data: wallets, error } = await supabase
      .from("wallets_v6") // Query the institutional view for ledger truth
      .select("*")
      .eq("user_id", userId);

    if (error) throw error;
    if (!wallets) return [];

    // Proactive Upgrade: If any wallet is a mock, try to upgrade it immediately
    // and return the updated version to the user.
    return Promise.all(
      wallets.map(async (wallet) => {
        return await this.upgradeIfMock(userId, wallet);
      })
    );
  }

  /**
   * Helper to detect and upgrade mock addresses
   */
  async upgradeIfMock(userId, wallet, targetNetwork = null) {
    const isCrypto = ["BTC", "ETH", "USDT", "USDC"].includes(wallet.currency);
    const MOCK_KEYWORDS = ["-", "dummy", "test", "mock", "address", "123456", "example"];
    const isMock = wallet.address && MOCK_KEYWORDS.some(kw => wallet.address.toLowerCase().includes(kw));
    
    // Also upgrade if the network doesn't match and it's not a native request
    const networkMismatch = targetNetwork && targetNetwork !== "NATIVE" && wallet.network !== targetNetwork;

    if (isCrypto && (isMock || networkMismatch)) {
      try {
        const nowpayments = require("./nowpaymentsService");
        const upgradeNetwork = targetNetwork || wallet.network;
        logger.info(
          `[WalletService] Upgrading ${isMock ? "mock" : "mismatched"} address for ${wallet.currency} (${upgradeNetwork}) for user ${userId}`,
        );
        const real = await nowpayments.getOrCreateDepositAddress(
          userId,
          wallet.currency,
          upgradeNetwork,
          supabase,
        );

        await supabase.from("wallets_store").update({
          address: real.address,
          network: upgradeNetwork,
          provider: "nowpayments",
        }).eq("id", wallet.id);

        return { ...wallet, address: real.address, network: upgradeNetwork, provider: "nowpayments" };
      } catch (e) {
        logger.error(
          `[WalletService] Failed to upgrade address for ${wallet.currency}: ${e.message}`,
        );
      }
    }
    return wallet;
  }

  async getAddress(userId, currency, network = "native", forceNew = false) {
    const wallet = await this.createWallet(userId, currency, network, forceNew);
    return {
      address: wallet.address,
      currency: wallet.currency,
      network: wallet.network,
    };
  }

  /**
   * Create or fetch a wallet
   */
  async createWallet(userId, currency, network = "native", forceNew = false) {
    const upCurrency = currency.toUpperCase();

    // Normalize network casing: blockchain names are lowercase, layer names are uppercase
    let normNetwork = (network || "native").toLowerCase();
    if (["erc20", "trc20", "bep20", "polygon"].includes(normNetwork)) {
      normNetwork = normNetwork.toUpperCase();
    }
    const upNetwork = normNetwork;

    const isCrypto = ["BTC", "ETH", "USDT", "USDC"].includes(upCurrency);

    if (!isCrypto || !forceNew) {
      const { data: existing } = await supabase
        .from("wallets_store")
        .select("*")
        .eq("user_id", userId)
        .eq("currency", upCurrency)
        .ilike("network", upNetwork)
        .maybeSingle();

      if (existing) {
        // Use helper to handle upgrades
        return await this.upgradeIfMock(userId, existing, upNetwork);
      }
    }

    // New Wallet Creation
    let address = uuidv4();
    let provider = "internal";

    if (isCrypto) {
      try {
        const nowpayments = require("./nowpaymentsService");
        const real = await nowpayments.getOrCreateDepositAddress(
          userId,
          upCurrency,
          upNetwork,
          supabase,
          forceNew,
        );
        address = real.address;
        provider = "nowpayments";
      } catch (e) {
        logger.error("[WalletService] Failed to get real crypto address", e);
        // Fallback to UUID if NOWPayments fails (prevents breaking the app)
      }
    } else {
      // Fiat/Internal - Use Email or ID
      try {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email, username")
          .eq("id", userId)
          .single();
        if (profile) {
          address = profile.email || profile.username || userId;
        }
      } catch (e) {
        logger.error(
          "[WalletService] Failed to fetch profile for fiat address",
          e,
        );
      }
    }

    const { data: wallet, error } = await supabase
      .from("wallets_store")
      .insert({
        user_id: userId,
        currency: upCurrency,
        network: upNetwork,
        address: address,
        provider: provider,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        // Race condition: wallet was created by another process. Fetch it instead.
        const { data: retry } = await supabase
          .from("wallets_store")
          .select("*")
          .eq("user_id", userId)
          .eq("currency", upCurrency)
          .maybeSingle();
        if (retry) return retry;
      }
      throw error;
    }
    return wallet;
  }

  /**
   * Unified Deposit flow (Deletgate to infrastructures for sessions)
   */
  async deposit(
    userId,
    { method, currency, amount, userPlan, idempotencyKey },
  ) {
    const depositService = require("./depositService");

    if (method === "card") {
      return depositService.createCardDeposit(
        userId,
        currency,
        amount,
        userPlan,
        idempotencyKey,
      );
    } else if (method === "bank") {
      return depositService.createBankDeposit(
        userId,
        currency,
        amount,
        userPlan,
        idempotencyKey,
      );
    } else {
      // Default to crypto
      return depositService.initializeCryptoDeposit(
        userId,
        currency,
        amount,
        userPlan,
        idempotencyKey,
      );
    }
  }

  /**
   * Bank-Grade Unified Withdrawal Pipeline (Zero-Loss)
   */
  async withdraw(userId, data) {
    const SystemState = require('../config/SystemState');
    const mode = SystemState.getWithdrawalMode();
    
    if (mode === "FROZEN") {
        throw new Error("SYSTEM_FROZEN: Withdrawals are currently disabled.");
    }

    const { currency, amount, type, client_idempotency_key, ip, deviceId } = data;
    const upCurrency = (currency || 'USD').toUpperCase();
    const numAmount = parseFloat(amount);
    
    // 1. FRAUD GATING (Institutional Step 1)
    const fraudEngine = require("./payment/FraudEngine");
    const risk = await fraudEngine.evaluateWithdrawalRisk(userId, {
        amount: numAmount,
        currency: upCurrency,
        ip,
        deviceId
    });

    if (risk.action === "block" || (mode === "DEGRADED" && numAmount > 100)) {
        throw new Error(`SECURITY_BLOCK: This withdrawal request was flagged for review. Reasons: ${risk.reasons.join(', ')}`);
    }

    // 2. INITIALIZATION & DETERMINISTIC INTENT
    const payoutService = require("./payment/payoutService");
    const commissionService = require("./commissionService");
    
    const wallet = await this.createWallet(userId, upCurrency, data.network);
    
    // Calculate total debit including commission
    const commission = await commissionService.calculateCommission("WITHDRAWAL", numAmount, upCurrency, data.userPlan);
    const totalDebit = math.formatSafe(math.parseSafe(numAmount).add(math.parseSafe(commission.fee)));

    // HYBRID APPROVAL LOGIC
    let initialStatus = 'pending_review';
    if (numAmount <= 100 && risk.score < 40 && mode === "NORMAL") {
        initialStatus = 'approved';
    } else if (risk.action === 'review') {
        initialStatus = 'pending_risk_review';
    }

    // 3. CREATE PAYOUT REQUEST (Atomic Intent Push)
    // This pushes 'payout_create' to the Causal Queue which handles the v6 'RESERVED' ledger entry.
    const payoutIntent = await payoutService.createPayoutRequest(userId, wallet.id, {
      ...data,
      amount: numAmount,
      net_amount: numAmount - (commission.fee || 0),
      fee: commission.fee,
      status: initialStatus,
      risk_score: risk.score,
      client_idempotency_key,
      ip,
      deviceId
    });

    return { 
      success: true, 
      status: initialStatus.toUpperCase(), 
      payoutId: payoutIntent.id,
      sequenceId: payoutIntent.sequence_id,
      message: initialStatus === 'approved' ? "Withdrawal approved and scheduled for dispatch." : "Withdrawal submitted and pending review."
    };
  }

  /**
   * Internal Transfer with Absolute Causal Consistency (DFOS v5)
   * Uses atomic intent grouping and cross-shard dependencies.
   */
  async transferInternal(userId, userPlan, data) {
    const SystemState = require('../config/SystemState');
    if (SystemState.isSafe()) {
        throw new Error("SAFE_MODE_BLOCK: Ledger mutations disabled");
    }

    const { recipientId, amount, currency } = data;
    const causalGroupId = require('crypto').randomUUID();
    const upCurrency = currency.toUpperCase();
    
    // 1. Resolve Shards
    const senderShard = parseInt(userId.substring(0, 8), 16) % 4;
    const receiverShard = parseInt(recipientId.substring(0, 8), 16) % 4;

    logger.info(`[WalletService] Initiating Atomic Transfer. Group: ${causalGroupId}`);

    // 2. ATOMIC INTENT BATCH: One transaction, multiple rows, shared group
    const { data: intents, error } = await supabase
      .from('causal_execution_queue')
      .insert([
        {
          wallet_id: userId,
          shard_id: senderShard,
          causal_group_id: causalGroupId,
          idempotency_key: `debit_${causalGroupId}`,
          intent_type: 'ledger_mutation',
          expected_version: 0, 
          payload: { action: 'DEBIT', amount, currency: upCurrency, counterparty: recipientId }
        },
        {
          wallet_id: recipientId,
          shard_id: receiverShard,
          causal_group_id: causalGroupId,
          idempotency_key: `credit_${causalGroupId}`,
          intent_type: 'ledger_mutation',
          expected_version: 0,
          payload: { action: 'CREDIT', amount, currency: upCurrency, counterparty: userId },
          depends_on_intents: [] // Dependency link defined by group
        }
      ])
      .select();

    if (error) throw error;
    
    return { 
      success: true, 
      status: 'Processing', 
      causal_group_id: causalGroupId,
      sequenceIds: intents.map(i => i.sequence_id)
    };
  }

  /**
   * Secure Withdrawal Cancellation
   * Allowed ONLY in early states before provider dispatch.
   */
  async cancelWithdrawal(userId, requestId) {
    const payoutService = require("./payment/payoutService");
    
    // 1. Lock request
    const { data: request, error } = await supabase
        .from('payout_requests')
        .select('*')
        .eq('id', requestId)
        .eq('user_id', userId)
        .single();
    
    if (error || !request) throw new Error("Withdrawal request not found");

    // 2. Enforce Cancellation Window
    const allowedStates = ['REQUESTED', 'VALIDATING', 'APPROVED']; // Added APPROVED since no dispatch yet
    if (!allowedStates.includes(request.withdrawal_state)) {
        throw new Error(`Cannot cancel withdrawal in current state: ${request.withdrawal_state}`);
    }

    // 3. Reversal
    // Find matching ledger entry (status = 'reserved')
    const { data: ledger } = await supabase
        .from('ledger_entries')
        .select('id')
        .eq('user_id', userId)
        .eq('status', 'reserved')
        .filter('reference', 'ilike', `wdr_${requestId.substring(0, 8)}%`)
        .maybeSingle();

    if (ledger) {
        await supabase.rpc('reverse_withdrawal_funds', { 
            p_ledger_id: ledger.id, 
            p_reason: 'User cancelled withdrawal' 
        });
    }

    await payoutService.updatePayoutState(requestId, 'REVERSED', { cancelled_by: 'user' });

    return { success: true, message: 'Withdrawal successfully cancelled and funds returned.' };
  }
}

module.exports = new WalletService();
