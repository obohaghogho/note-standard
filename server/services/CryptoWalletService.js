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
    if (!userId) throw new Error("User ID is required for wallet creation.");
    const normUserId = String(userId).trim().toLowerCase();
    const upCurrency = String(currency).trim().toUpperCase();

    if (!["BTC", "ETH", "USDT", "USDC"].includes(upCurrency)) {
      throw new Error("Fiat currencies are strictly forbidden in CryptoWalletService.");
    }

    let normNetwork = network.toLowerCase();
    if (["erc20", "trc20", "bep20", "polygon"].includes(normNetwork)) {
      normNetwork = normNetwork.toUpperCase();
    }
    const upNetwork = normNetwork;

    if (!forceNew) {
      const { data: userWallets } = await supabase
        .from("wallets_store")
        .select("*")
        .eq("user_id", normUserId);

      if (userWallets && userWallets.length > 0) {
        const match = userWallets.find(
          (w) => String(w.currency).trim().toUpperCase() === upCurrency
        );
        if (match) {
          return await this.upgradeIfMock(normUserId, match, upNetwork);
        }
      }
    }

    // New Crypto Wallet Creation
    let address = uuidv4();
    let provider = "internal";

    try {
      const real = await nowpaymentsService.getOrCreateDepositAddress(
        normUserId,
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

    // Attempt insert without onConflict
    let { data: wallet, error } = await supabase
      .from("wallets_store")
      .insert({
        user_id: normUserId,
        currency: upCurrency,
        network: upNetwork,
        address: address,
        provider: provider,
      })
      .select()
      .maybeSingle();

    if (wallet) return wallet;

    // Fallback if insert errored (e.g. duplicate key or race condition)
    const { data: recheckWallets } = await supabase
      .from("wallets_store")
      .select("*")
      .eq("user_id", normUserId);

    if (recheckWallets && recheckWallets.length > 0) {
      const recheckMatch = recheckWallets.find(
        (w) => String(w.currency).trim().toUpperCase() === upCurrency
      );
      if (recheckMatch) return recheckMatch;
    }

    if (error) {
      logger.warn(`[CryptoWalletService] Crypto wallet insert warning for user ${normUserId} (${upCurrency}): ${error.message}`);
    }

    const fallbackAddress = `${upCurrency}_${normUserId.replace(/-/g, '')}_${Date.now()}`;
    const { data: retryWallet } = await supabase
      .from("wallets_store")
      .insert({
        user_id: normUserId,
        currency: upCurrency,
        network: upNetwork,
        address: fallbackAddress,
        provider: provider,
      })
      .select()
      .maybeSingle();

    if (retryWallet) return retryWallet;

    // Final fetch attempt
    const { data: finalWallets } = await supabase
      .from("wallets_store")
      .select("*")
      .eq("user_id", normUserId);

    const finalMatch = (finalWallets || []).find(
      (w) => String(w.currency).trim().toUpperCase() === upCurrency
    );
    if (finalMatch) return finalMatch;

    throw new Error(`Failed to initialize ${upCurrency} crypto wallet: ${error ? error.message : "Unknown DB Error"}`);
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

    const numericAmount = parseFloat(amount);
    const minCryptoAmount = (upCurrency === "USDT" || upCurrency === "USDC") ? 15 : 10;
    if (isNaN(numericAmount) || numericAmount < minCryptoAmount) {
      throw new Error(`Minimum deposit amount for ${upCurrency} is $${minCryptoAmount}. Please enter $${minCryptoAmount} or higher.`);
    }

    const { data: profile } = await supabase.from("profiles").select("email").eq("id", userId).single();
    if (!profile || !profile.email) { throw new Error("User profile not found"); }

    const limit = await checkDailyLimit(userId, userPlan, numericAmount);
    if (!limit.allowed) { throw new Error("Daily limit exceeded."); }

    const PaymentService = require("./payment/paymentService");
    return await PaymentService.initializePayment(userId, profile.email, numericAmount, upCurrency, { type: "Digital Assets Purchase", userPlan, idempotencyKey }, { isCrypto: true });
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
    if (Number(wallet.available_balance) < parseFloat(amount)) {
        throw new Error(`INSUFFICIENT_FUNDS: Available balance (${wallet.available_balance} ${upCurrency}) is less than requested amount (${amount} ${upCurrency}).`);
    }
    
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
