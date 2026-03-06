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
      .from("wallets")
      .select("*")
      .eq("user_id", userId);

    if (error) throw error;
    return wallets || [];
  }

  /**
   * Create or fetch a wallet
   */
  async createWallet(userId, currency, network = "native") {
    const { data: existing } = await supabase
      .from("wallets")
      .select("*")
      .eq("user_id", userId)
      .eq("currency", currency)
      .eq("network", network)
      .maybeSingle();

    if (existing) return existing;

    const { data: wallet, error } = await supabase
      .from("wallets")
      .insert({
        user_id: userId,
        currency: currency,
        network: network,
        balance: 0,
        address: uuidv4(),
      })
      .select()
      .single();

    if (error) throw error;
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
    const feeEngine = require("./feeEngine");
    const payoutService = require("./payment/payoutService");
    const commission = feeEngine.calculateFees(amount, currency);

    const wallet = await this.createWallet(userId, currency, network);
    if (
      parseFloat(wallet.balance) < (parseFloat(amount) + commission.totalFee)
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
        p_fee: commission.totalFee,
        p_rate: commission.rates.total,
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
      admin_fee: commission.breakdown?.admin_fee || commission.totalFee, // fallback
      partner_fee: commission.breakdown?.partner_reward || 0,
      referral_fee: commission.breakdown?.referrer || 0,
    });

    // Update with external tracking
    await supabase.from("transactions").update({
      reference_id: reference,
      external_payout_id: String(payoutResult.payoutId),
      external_payout_status: payoutResult.status,
      provider: payoutResult.provider,
      status: "PROCESSING",
    }).eq("id", txId);

    return { success: true, transactionId: txId, fee: commission.totalFee };
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
    const feeEngine = require("./feeEngine");
    const commission = feeEngine.calculateFees(amount, currency);

    const transferAmount = parseFloat(amount);
    let targetUserId = recipientId;
    let isExternal = false;

    // Resolve recipient
    if (!targetUserId && recipientAddress) {
      const { data: targetWallet } = await supabase.from("wallets").select(
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

    const { data: senderWallet } = await supabase.from("wallets").select(
      "id, balance",
    )
      .eq("user_id", userId).eq("currency", currency).eq("network", network)
      .single();

    if (!senderWallet) throw new Error("Sender wallet not found");
    if (
      parseFloat(senderWallet.balance) < (transferAmount + commission.totalFee)
    ) {
      throw new Error(
        `Insufficient funds. Need ${
          transferAmount + commission.totalFee
        } ${currency}`,
      );
    }

    if (isExternal) {
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
          p_fee: commission.totalFee,
          p_rate: commission.rates.total,
          p_platform_wallet_id: await require("./commissionService")
            .getPlatformWalletId(currency),
          p_idempotency_key: idempotencyKey,
          p_2fa_verified: true,
          p_metadata: {
            externalAddress: recipientAddress,
            source: "transfer_unified",
            transaction_fee_breakdown: commission,
            provider_response: payoutResult,
          },
        },
      );
      if (txError) throw txError;
      return { success: true, transactionId: txId, fee: commission.totalFee };
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
        p_fee: commission.totalFee,
        p_rate: commission.rates.total,
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
      admin_fee: commission.breakdown?.admin_fee || commission.totalFee,
      partner_fee: commission.breakdown?.partner_reward || 0,
      referral_fee: commission.breakdown?.referrer || 0,
    });

    return {
      success: true,
      transactionId: txId,
      fee: commission.totalFee,
      targetUserId,
    };
  }
}

module.exports = new WalletService();
