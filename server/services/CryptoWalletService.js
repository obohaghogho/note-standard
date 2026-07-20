const supabase = require("../config/database");
const { v4: uuidv4 } = require("uuid");
const logger = require("../utils/logger");
const nowpaymentsService = require("./nowpaymentsService");
const { checkDailyLimit } = require("../utils/limitCheck");
const SystemState = require("../config/SystemState");

/**
 * CryptoWalletService
 * Strictly handles crypto operations (BTC, ETH, USDT, USDC). No fiat code allowed.
 */
class CryptoWalletService {
  /**
   * Get all crypto wallets for a user
   */
  async getWallets(userId) {
    const { data: wallets, error } = await supabase
      .from("wallets_v6")
      .select("*")
      .eq("user_id", userId)
      .in("currency", ["BTC", "ETH", "USDT", "USDC"]);

    if (error) throw error;

    return Promise.all(
      (wallets || []).map(async (wallet) => {
        return await this.upgradeIfMock(userId, wallet);
      })
    );
  }

  /**
   * Helper to detect and upgrade mock addresses
   */
  async upgradeIfMock(userId, wallet, targetNetwork = null) {
    const isMock = !wallet.address || 
                   wallet.address.length < 26 || 
                   wallet.address.toLowerCase().includes("mock") || 
                   wallet.address.toLowerCase().includes("dummy") || 
                   wallet.address.toLowerCase().includes("example") || 
                   wallet.address.toLowerCase().includes("generating") || 
                   wallet.address.toLowerCase() === "tbd" || 
                   /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(wallet.address);
    
    const networkMismatch = targetNetwork && targetNetwork !== "NATIVE" && wallet.network !== targetNetwork;

    if (isMock || networkMismatch) {
      try {
        const upgradeNetwork = targetNetwork || wallet.network;
        logger.info(`[CryptoWalletService] Upgrading address for ${wallet.currency} (${upgradeNetwork}) for user ${userId}`);
        const real = await nowpaymentsService.getOrCreateDepositAddress(
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
        logger.error(`[CryptoWalletService] Failed to upgrade address for ${wallet.currency}: ${e.message}`);
      }
    }
    return wallet;
  }

  /**
   * Get or create crypto address
   */
  async getAddress(userId, currency, network, forceNew = false) {
    if (!network) throw new Error("Explicit network selection is required.");
    const wallet = await this.createWallet(userId, currency, network, forceNew);
    return {
      address: wallet.address,
      currency: wallet.currency,
      network: wallet.network,
    };
  }

  /**
   * Create or fetch a crypto wallet
   */
  async createWallet(userId, currency, network, forceNew = false) {
    if (!network) throw new Error("Explicit network selection is required.");
    const upCurrency = currency.toUpperCase();

    if (!["BTC", "ETH", "USDT", "USDC"].includes(upCurrency)) {
      throw new Error("Fiat currencies are strictly forbidden in CryptoWalletService.");
    }

    let normNetwork = network.toLowerCase();
    if (["erc20", "trc20", "bep20", "polygon"].includes(normNetwork)) {
      normNetwork = normNetwork.toUpperCase();
    }
    const upNetwork = normNetwork;

    if (!forceNew) {
      const { data: existing } = await supabase
        .from("wallets_v6")
        .select("*")
        .eq("user_id", userId)
        .eq("currency", upCurrency)
        .ilike("network", upNetwork)
        .maybeSingle();

      if (existing) {
        return await this.upgradeIfMock(userId, existing, upNetwork);
      }
    }

    // New Crypto Wallet Creation
    let address = uuidv4();
    let provider = "internal";

    try {
      const real = await nowpaymentsService.getOrCreateDepositAddress(
        userId,
        upCurrency,
        upNetwork,
        supabase,
        forceNew,
      );
      address = real.address;
      provider = "nowpayments";
    } catch (e) {
      logger.error("[CryptoWalletService] Failed to get real crypto address", e);
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
   * Initialize a crypto deposit
   */
  async deposit(userId, currency, network, amount = 10, userPlan = "FREE", idempotencyKey = null) {
    if (!SystemState.getFeatureFlag('CRYPTO_DEPOSITS_ENABLED')) {
      throw new Error("Crypto deposits are currently disabled.");
    }
    if (!network) throw new Error("Explicit network selection is required.");

    const upCurrency = String(currency).toUpperCase();
    if (!["BTC", "ETH", "USDT", "USDC"].includes(upCurrency)) {
        throw new Error("CryptoWalletService only supports crypto deposits.");
    }

    const { data: profile } = await supabase.from("profiles").select("email").eq("id", userId).single();
    if (!profile || !profile.email) { throw new Error("User profile not found"); }

    const limit = await checkDailyLimit(userId, userPlan, amount);
    if (!limit.allowed) { throw new Error("Daily limit exceeded."); }

    const PaymentService = require("./payment/paymentService");
    return await PaymentService.initializePayment(userId, profile.email, amount, upCurrency, { type: "Digital Assets Purchase", userPlan, idempotencyKey }, { isCrypto: true });
  }

  /**
   * Withdraw crypto
   */
  async withdraw(userId, data) {
    if (!SystemState.getFeatureFlag('CRYPTO_WITHDRAWALS_ENABLED')) {
      throw new Error("Crypto withdrawals are currently disabled.");
    }

    const { currency, amount, network, address, client_idempotency_key } = data;
    if (!network) throw new Error("Explicit network selection is required.");

    const upCurrency = String(currency).toUpperCase();
    
    if (!["BTC", "ETH", "USDT", "USDC"].includes(upCurrency)) {
      throw new Error("Crypto withdrawals must use CryptoWalletService.");
    }

    const payoutService = require("./payment/payoutService");
    const wallet = await this.createWallet(userId, upCurrency, network);
    
    // Create payout request directly (assuming crypto doesn't go through fiat fraud engine for now, or use a separate one)
    const payoutIntent = await payoutService.createPayoutRequest(userId, wallet.id, {
      ...data,
      method: 'crypto',
      type: 'crypto',
      currency: upCurrency,
      amount: parseFloat(amount),
      net_amount: parseFloat(amount),
      fee: 0,
      status: 'pending_review',
      destination: { address, network },
      client_idempotency_key
    });

    return { 
      success: true, 
      status: 'PENDING_REVIEW', 
      payoutId: payoutIntent.id,
      message: "Crypto withdrawal submitted and pending review."
    };
  }
}

module.exports = new CryptoWalletService();
