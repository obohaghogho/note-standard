const supabase = require("../config/database");
const { v4: uuidv4 } = require("uuid");
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
      .from("wallets_store")
      .select("*")
      .eq("user_id", userId);

    if (error) throw error;
    return wallets || [];
  }

  /**
   * Get or create a specific wallet address
   */
  async getAddress(userId, currency, network = "native") {
    const wallet = await this.createWallet(userId, currency, network);
    return {
      address: wallet.address,
      currency: wallet.currency,
      network: wallet.network,
    };
  }

  /**
   * Create or fetch a wallet
   */
  async createWallet(userId, currency, network = "native") {
    const upCurrency = currency.toUpperCase();

    // Normalize network casing: blockchain names are lowercase, layer names are uppercase
    let normNetwork = (network || "native").toLowerCase();
    if (["erc20", "trc20", "bep20", "polygon"].includes(normNetwork)) {
      normNetwork = normNetwork.toUpperCase();
    }
    const upNetwork = normNetwork;

    const { data: existing } = await supabase
      .from("wallets_store")
      .select("*")
      .eq("user_id", userId)
      .eq("currency", upCurrency)
      .eq("network", upNetwork)
      .maybeSingle();

    if (existing) {
      // If crypto wallet but address is still a UUID (mock), or network mismatch, try to upgrade it
      const isCrypto = ["BTC", "ETH", "USDT", "USDC"].includes(upCurrency);
      const isMock = existing.address && existing.address.includes("-");
      const networkMismatch = upNetwork !== "NATIVE" &&
        existing.network !== upNetwork;

      if (isCrypto && (isMock || networkMismatch)) {
        try {
          const nowpayments = require("./nowpaymentsService");
          logger.info(
            `[WalletService] Upgrading mock address for ${upCurrency} (${upNetwork}) for user ${userId}`,
          );
          const real = await nowpayments.getOrCreateDepositAddress(
            userId,
            upCurrency,
            upNetwork,
            supabase,
          );
          return { ...existing, address: real.address, network: upNetwork };
        } catch (e) {
          logger.error(
            `[WalletService] Failed to upgrade mock address for ${upCurrency}: ${e.message}`,
            { stack: e.stack },
          );
        }
      }
      return existing;
    }

    // New Wallet Creation
    let address = uuidv4();
    let provider = "internal";

    const isCrypto = ["BTC", "ETH", "USDT", "USDC"].includes(upCurrency);
    if (isCrypto) {
      try {
        const nowpayments = require("./nowpaymentsService");
        const real = await nowpayments.getOrCreateDepositAddress(
          userId,
          upCurrency,
          upNetwork,
          supabase,
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
        balance: 0,
        available_balance: 0,
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
          .eq("network", upNetwork)
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
   * Unified Withdrawal flow
   */
  async withdraw(
    userId,
    {
      type,
      currency,
      amount,
      network,
      destination,
      bankId,
      userPlan,
      idempotencyKey,
    },
  ) {
    const commissionService = require("./commissionService");
    const payoutService = require("./payment/payoutService");
    const commission = await commissionService.calculateCommission(
      "WITHDRAWAL",
      amount,
      currency,
      userPlan,
    );

    const wallet = await this.createWallet(userId, currency, network);
    if (
      parseFloat(wallet.balance) <
        (parseFloat(amount) + parseFloat(commission.fee))
    ) {
      throw new Error(
        "Insufficient balance to cover amount and withdrawal fee",
      );
    }

    const reference = `wdr_${Date.now()}_${userId.substring(0, 8)}`;
    let payoutResult;

    if (type === "crypto") {
      payoutResult = await payoutService.createNowPaymentsPayout(
        destination,
        parseFloat(amount),
        currency,
        reference,
        network,
      );
    } else {
      const defaultBankCode = "044";
      payoutResult = await payoutService.createFlutterwaveTransfer(
        defaultBankCode,
        bankId,
        parseFloat(amount),
        currency,
        reference,
        `Withdrawal for ${userId}`,
      );
    }

    const { data: txId, error: txError } = await supabase.rpc(
      "withdraw_funds_secured",
      {
        p_wallet_id: wallet.id,
        p_amount: parseFloat(amount),
        p_currency: currency,
        p_fee: parseFloat(commission.fee),
        p_rate: commission.rate,
        p_platform_wallet_id: await require("./commissionService")
          .getPlatformWalletId(currency),
        p_idempotency_key: idempotencyKey,
        p_2fa_verified: true, // Assuming middleware handled this
        p_metadata: {
          destination,
          bankId,
          transaction_fee_breakdown: commission,
          provider_response: payoutResult,
        },
      },
    );

    if (txError) throw txError;

    // Record in the new Fees table
    await supabase.from("fees").insert({
      transaction_id: txId,
      admin_fee: parseFloat(commission.fee),
      partner_fee: 0,
      referral_fee: 0,
    });

    // Update with external tracking
    await supabase.from("transactions").update({
      reference_id: reference,
      external_payout_id: String(payoutResult.payoutId),
      external_payout_status: payoutResult.status,
      provider: payoutResult.provider,
      status: "PROCESSING",
    }).eq("id", txId);

    return {
      success: true,
      transactionId: txId,
      fee: parseFloat(commission.fee),
    };
  }

  /**
   * Internal transfer between users or to external address (if unified)
   */
  async transferInternal(
    userId,
    userPlan,
    {
      recipientId,
      recipientEmail,
      recipientAddress,
      amount,
      currency,
      network = "native",
      idempotencyKey,
    },
  ) {
    const commissionService = require("./commissionService");
    // Initial estimation - will re-evaluate once recipient is known
    let commission = await commissionService.calculateCommission(
      "TRANSFER_OUT",
      amount,
      currency,
      userPlan,
    );

    const transferAmount = parseFloat(amount);
    let targetUserId = recipientId;
    let isExternal = false;

    // Resolve recipient
    if (!targetUserId && recipientAddress) {
      const { data: targetWallet } = await supabase.from("wallets_store")
        .select(
          "user_id",
        )
        .eq("address", recipientAddress).eq("currency", currency).eq(
          "network",
          network,
        ).single();

      if (targetWallet) targetUserId = targetWallet.user_id;
      else if (
        (currency === "BTC" &&
          /^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$/.test(recipientAddress)) ||
        (currency === "ETH" && /^0x[a-fA-F0-9]{40}$/.test(recipientAddress))
      ) {
        isExternal = true;
      } else {
        throw new Error("Recipient not found and address format invalid");
      }
    }

    if (!targetUserId && !isExternal && recipientEmail) {
      const { data: profile } = await supabase.from("profiles").select("id").eq(
        "email",
        recipientEmail,
      ).single();
      if (profile) targetUserId = profile.id;
    }

    if (!targetUserId && !isExternal) {
      throw new Error("Could not resolve recipient");
    }

    const { data: senderWallet } = await supabase.from("wallets_store").select(
      "id, balance",
    )
      .eq("user_id", userId).eq("currency", currency).eq("network", network)
      .single();

    if (!senderWallet) throw new Error("Sender wallet not found");
    if (
      parseFloat(senderWallet.balance) <
        (transferAmount + parseFloat(commission.fee))
    ) {
      throw new Error(
        `Insufficient funds. Need ${
          transferAmount + parseFloat(commission.fee)
        } ${currency}`,
      );
    }

    if (isExternal) {
      // Re-calculate commission as WITHDRAWAL for external crypto sends
      commission = await commissionService.calculateCommission(
        "WITHDRAWAL",
        amount,
        currency,
        userPlan,
      );

      const payoutService = require("./payment/payoutService");
      const reference = `wdr_${Date.now()}_${userId.substring(0, 8)}`;
      const payoutResult = await payoutService.createNowPaymentsPayout(
        recipientAddress,
        transferAmount,
        currency,
        reference,
        network,
      );

      const { data: txId, error: txError } = await supabase.rpc(
        "withdraw_funds_secured",
        {
          p_wallet_id: senderWallet.id,
          p_amount: transferAmount,
          p_currency: currency,
          p_fee: parseFloat(commission.fee),
          p_rate: commission.rate,
          p_platform_wallet_id: await require("./commissionService")
            .getPlatformWalletId(currency),
          p_idempotency_key: idempotencyKey,
          p_2fa_verified: true, // Assuming middleware handled this
          p_metadata: {
            externalAddress: recipientAddress,
            source: "transfer_unified",
            transaction_fee_breakdown: commission,
            provider_response: payoutResult,
          },
        },
      );
      if (txError) throw txError;
      return {
        success: true,
        transactionId: txId,
        fee: parseFloat(commission.fee),
      };
    }

    let recipientWallet = await this.createWallet(
      targetUserId,
      currency,
      network,
    );

    const { data: txId, error: txError } = await supabase.rpc(
      "transfer_funds",
      {
        p_sender_wallet_id: senderWallet.id,
        p_receiver_wallet_id: recipientWallet.id,
        p_amount: transferAmount,
        p_currency: currency,
        p_fee: parseFloat(commission.fee),
        p_rate: commission.rate,
        p_platform_wallet_id: await require("./commissionService")
          .getPlatformWalletId(currency),
        p_idempotency_key: idempotencyKey,
        p_metadata: {
          transaction_fee_breakdown: commission,
        },
      },
    );

    if (txError) throw txError;

    // Record in the new Fees table
    await supabase.from("fees").insert({
      transaction_id: txId,
      admin_fee: parseFloat(commission.fee),
      partner_fee: 0,
      referral_fee: 0,
    });

    return {
      success: true,
      transactionId: txId,
      fee: parseFloat(commission.fee),
      targetUserId,
    };
  }
}

module.exports = new WalletService();
