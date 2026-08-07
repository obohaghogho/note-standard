const supabase = require("../config/database");
const { v4: uuidv4 } = require("uuid");
const math = require("../utils/mathUtils");
const logger = require("../utils/logger");
const LedgerService = require("./LedgerService");
const { FINCRA_SUPPORTED_SET, FINCRA_COMING_SOON_SET } = require("./fincra/constants");

// Hard crypto-only currencies: on-chain custody via NowPayments, never through Fincra fiat
const HARD_CRYPTO_CURRENCIES = new Set(["BTC", "ETH"]);

/**
 * FiatWalletService
 * Strictly handles fiat wallets (e.g. NGN, USD, EUR, GBP). No crypto code allowed.
 */
class FiatWalletService {
  /**
   * Get all fiat wallets for a user
   */
  async getWallets(userId) {
    const { data: wallets, error } = await supabase
      .from("wallets_v6")
      .select("*")
      .eq("user_id", userId)
      // Only exclude on-chain crypto custody currencies from the fiat view.
      // USDT and USDC via Fincra are fiat settlement and are included here.
      .not("currency", "in", "(BTC,ETH)");

    if (error) throw error;
    
    // Format balances to distinguish Available, Pending, Locked
    return (wallets || []).map(wallet => ({
      ...wallet,
      balances: {
        available: parseFloat(wallet.balance) || 0,
        pending: parseFloat(wallet.pending_balance) || 0,
        locked: parseFloat(wallet.locked_balance) || 0,
      }
    }));
  }

  /**
   * Create or fetch a fiat wallet
   */
  async createWallet(userId, currency) {
    const upCurrency = currency.toUpperCase();

    // Block on-chain crypto-only currencies — these use CryptoWalletService (NowPayments)
    if (HARD_CRYPTO_CURRENCIES.has(upCurrency)) {
      throw new Error("BTC and ETH wallets must use CryptoWalletService (NowPayments on-chain custody).");
    }

    // Block coming-soon currencies from creating transactions
    if (FINCRA_COMING_SOON_SET.has(upCurrency)) {
      throw new Error(`CURRENCY_NOT_AVAILABLE: ${upCurrency} will become available after provider approval. Deposits and withdrawals are not yet enabled.`);
    }

    const { data: existing } = await supabase
      .from("wallets_v6")
      .select("*")
      .eq("user_id", userId)
      .eq("currency", upCurrency)
      .maybeSingle();

    if (existing) {
      return existing;
    }

    // Step 1: Double check wallets_store table directly (case-insensitive)
    const { data: existingStore } = await supabase
      .from("wallets_store")
      .select("*")
      .eq("user_id", userId)
      .ilike("currency", upCurrency)
      .maybeSingle();

    if (existingStore) {
      return existingStore;
    }

    // New Fiat Wallet Creation: Ensure address is unique per currency & user
    let address = `${upCurrency}_${userId.replace(/-/g, '').substring(0, 12)}`;
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, username")
        .eq("id", userId)
        .single();
      if (profile) {
        const identifier = profile.username || (profile.email ? profile.email.split('@')[0] : userId);
        address = `${upCurrency}_${identifier}`;
      }
    } catch (e) {
      address = `${upCurrency}_${userId}`;
    }

    // Step 2: Try insert with unique per-currency address
    let { data: wallet, error } = await supabase
      .from("wallets_store")
      .insert({
        user_id: userId,
        currency: upCurrency,
        network: "NATIVE",
        address: address,
        provider: "internal",
      })
      .select()
      .maybeSingle();

    if (wallet) {
      return wallet;
    }

    // If first insert failed due to address collision or constraint, retry with timestamped address
    if (error) {
      logger.warn(`[FiatWalletService] First insert attempt warning for user ${userId} (${upCurrency}): ${error.message}`);
      const fallbackAddress = `${upCurrency}_${userId.replace(/-/g, '')}_${Date.now()}`;
      const { data: retryWallet } = await supabase
        .from("wallets_store")
        .insert({
          user_id: userId,
          currency: upCurrency,
          network: "NATIVE",
          address: fallbackAddress,
          provider: "internal",
        })
        .select()
        .maybeSingle();

      if (retryWallet) {
        return retryWallet;
      }
    }

    // Step 3: Fallback query if insert hit duplicate key or concurrent creation
    const { data: retry } = await supabase
      .from("wallets_store")
      .select("*")
      .eq("user_id", userId)
      .ilike("currency", upCurrency)
      .maybeSingle();

    if (retry) {
      return retry;
    }

    throw new Error(`Failed to initialize ${upCurrency} wallet for user: ${error ? error.message : "Unknown DB Error"}`);
  }

  async getSystemTransitWallet(currency) {
    const upCurrency = currency.toUpperCase();
    const address = `SYSTEM_TRANSIT_${upCurrency}`;
    
    const { data: existing } = await supabase
      .from("wallets_store")
      .select("*")
      .eq("address", address)
      .maybeSingle();

    if (existing) return existing;

    // We fallback to a generic UUID if no admin profile is found.
    const { data: admin } = await supabase.from('profiles').select('id').eq('role', 'superadmin').limit(1).maybeSingle();
    const adminId = admin ? admin.id : '00000000-0000-0000-0000-000000000000';

    const { data: newWallet, error } = await supabase
      .from("wallets_store")
      .insert({
        user_id: adminId,
        currency: upCurrency,
        network: "SYSTEM",
        address: address,
        provider: "internal",
      })
      .select()
      .single();
      
    if (error && error.code === '23505') {
       // race condition fallback
       return await this.getSystemTransitWallet(currency);
    }
    return newWallet;
  }

  /**
   * Directly fund a fiat wallet (used internally by webhooks/admin)
   * This uses the immutable execute_ledger_transaction_v6 route
   */
  async fundWallet(userId, currency, amount, idempotencyKey, metadata = {}) {
    const userWallet = await this.createWallet(userId, currency);
    const systemWallet = await this.getSystemTransitWallet(currency);
    
    const intent = {
      idempotencyKey,
      type: 'DEPOSIT',
      status: 'SETTLED',
      metadata,
      entries: [
        {
          wallet_id: userWallet.id,
          user_id: userId,
          currency: currency.toUpperCase(),
          amount: Math.abs(amount),
          side: 'CREDIT'
        },
        {
          wallet_id: systemWallet.id,
          user_id: systemWallet.user_id,
          currency: currency.toUpperCase(),
          amount: -Math.abs(amount),
          side: 'DEBIT'
        }
      ]
    };

    return await LedgerService.commitAtomicEvent(intent);
  }

  /**
   * Request a fiat withdrawal
   */
  async withdraw(userId, data) {
    const SystemState = require('../config/SystemState');
    if (SystemState.getWithdrawalMode() === "FROZEN") {
        throw new Error("SYSTEM_FROZEN: Withdrawals are currently disabled.");
    }

    const { currency, amount, client_idempotency_key, ip, deviceId, destination } = data;
    const upCurrency = (currency || 'USD').toUpperCase();
    const numAmount = parseFloat(amount);
    
    if (HARD_CRYPTO_CURRENCIES.has(upCurrency)) {
      throw new Error("Crypto withdrawals (BTC, ETH) must use CryptoWalletService.");
    }

    if (FINCRA_COMING_SOON_SET.has(upCurrency)) {
      throw new Error(`CURRENCY_NOT_AVAILABLE: ${upCurrency} is not yet available for withdrawals.`);
    }

    const fraudEngine = require("./payment/FraudEngine");
    const risk = await fraudEngine.evaluateWithdrawalRisk(userId, {
        amount: numAmount,
        currency: upCurrency,
        ip,
        deviceId
    });

    if (risk.action === "block") {
        throw new Error(`SECURITY_BLOCK: This withdrawal request was flagged for review. Reasons: ${risk.reasons.join(', ')}`);
    }

    const payoutService = require("./payment/payoutService");
    const commissionService = require("./commissionService");
    
    const wallet = await this.createWallet(userId, upCurrency);
    if (Number(wallet.available_balance) < numAmount) {
        throw new Error(`INSUFFICIENT_FUNDS: Available balance (${wallet.available_balance} ${upCurrency}) is less than requested amount (${numAmount} ${upCurrency}).`);
    }
    const commission = await commissionService.calculateCommission("WITHDRAWAL", numAmount, upCurrency, data.userPlan || 'FREE');
    
    let initialStatus = 'pending_review';
    if (numAmount <= 100 && risk.score < 40 && SystemState.getWithdrawalMode() === "NORMAL") {
        initialStatus = 'approved';
    } else if (risk.action === 'review') {
        initialStatus = 'pending_risk_review';
    }

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
      message: initialStatus === 'approved' ? "Withdrawal approved and scheduled." : "Withdrawal submitted and pending review."
    };
  }
}

module.exports = new FiatWalletService();
