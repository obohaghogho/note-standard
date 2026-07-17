const supabase = require("../config/database");
const { v4: uuidv4 } = require("uuid");
const math = require("../utils/mathUtils");
const logger = require("../utils/logger");
const LedgerService = require("./LedgerService");

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
      .not("currency", "in", "('BTC','ETH','USDT','USDC')"); // Filter out crypto

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

    if (["BTC", "ETH", "USDT", "USDC"].includes(upCurrency)) {
      throw new Error("Crypto currencies are strictly forbidden in FiatWalletService.");
    }

    const { data: existing } = await supabase
      .from("wallets_store")
      .select("*")
      .eq("user_id", userId)
      .eq("currency", upCurrency)
      .maybeSingle();

    if (existing) {
      return existing;
    }

    // New Fiat Wallet Creation
    let address = "";
    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email, username")
        .eq("id", userId)
        .single();
      if (profile) {
        address = profile.email || profile.username || userId;
      } else {
        address = userId;
      }
    } catch (e) {
      address = userId;
    }

    const { data: wallet, error } = await supabase
      .from("wallets_store")
      .insert({
        user_id: userId,
        currency: upCurrency,
        network: "NATIVE",
        address: address,
        provider: "internal",
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
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
    
    if (["BTC", "ETH", "USDT", "USDC"].includes(upCurrency)) {
      throw new Error("Crypto withdrawals must use CryptoWalletService.");
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
