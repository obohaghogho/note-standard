const supabase = require("../../config/supabase");
const PaymentFactory = require("./PaymentFactory");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../utils/logger");
const mailService = require("../mailService");

class PaymentService {
  /**
   * Initialize a payment
   */
  async initializePayment(
    userId,
    email,
    amount,
    currency,
    metadata = {},
    options = {},
  ) {
    const reference = `tx_${uuidv4().replace(/-/g, "")}`;
    const isCrypto = options.isCrypto || false;

    // 1. Determine provider via Factory
    const provider = PaymentFactory.getProvider(
      currency,
      metadata.region || "NG",
      isCrypto,
    );
    const providerName = provider.constructor.name.replace("Provider", "")
      .toLowerCase();

    logger.info(`Initializing ${providerName} payment`, {
      userId,
      reference,
      currency,
      amount,
      provider: providerName,
    });

    // 2. Create transaction record in DB BEFORE initialization (Mandatory)
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        amount: parseFloat(amount),
        currency: currency,
        status: "PENDING",
        reference_id: reference,
        provider: providerName,
        display_label: "Digital Assets Purchase",
        metadata: {
          ...metadata,
          userId,
          email,
          category: "digital_assets",
          product_type: "digital_asset",
        },
        type: isCrypto
          ? "Digital Assets Purchase"
          : (metadata.type || "DEPOSIT"),
      })
      .select()
      .single();

    if (txError) {
      logger.error("DB Error creating transaction", {
        error: txError,
        userId,
        reference,
      });
      throw new Error("Failed to create transaction record");
    }

    try {
      // 3. Initialize with provider
      const callbackUrl = options.callbackUrl ||
        `${
          process.env.CLIENT_URL || "https://notestandard.com"
        }/payment-callback?reference=${reference}`;

      const initData = await provider.initialize({
        email,
        amount,
        currency,
        reference,
        callbackUrl,
        metadata: {
          ...metadata,
          transactionId: transaction.id,
          userId,
        },
      });

      // 4. Update transaction with provider reference if needed
      if (initData.providerReference) {
        await supabase
          .from("transactions")
          .update({ provider_reference: initData.providerReference })
          .eq("id", transaction.id);
      }

      return {
        url: initData.checkoutUrl,
        paymentUrl: initData.paymentUrl || initData.checkoutUrl,
        payAddress: initData.payAddress,
        reference: reference,
        provider: providerName,
      };
    } catch (error) {
      // Mark transaction as failed
      await supabase
        .from("transactions")
        .update({
          status: "FAILED",
          metadata: { ...transaction.metadata, error: error.message },
        })
        .eq("id", transaction.id);

      throw error;
    }
  }

  /**
   * Verify and update a single transaction status
   */
  async verifyPaymentStatus(reference) {
    const { data: tx, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("reference_id", reference)
      .single();

    if (error || !tx) return null;

    // If already completed or failed, just return
    if (tx.status !== "PENDING") return tx;

    try {
      const provider = PaymentFactory.getProviderByName(tx.provider);
      // Use provider_reference if available, otherwise fallback to reference_id
      const queryRef = tx.provider_reference || tx.reference_id;

      const verification = await provider.verify(queryRef);

      if (verification.status === "success") {
        await this.finalizeTransaction(reference, verification);
      } else if (verification.status === "failed") {
        await this.failTransaction(reference, "Provider reported failure");
      }

      // Fetch updated record
      const { data: updatedTx } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", tx.id)
        .single();

      return updatedTx || tx;
    } catch (err) {
      logger.error(`Status verification failed for ${reference}:`, err.message);
      return tx;
    }
  }

  /**
   * Verify Webhook Signature
   */
  async verifyWebhookSignature(providerName, headers, body, rawBody = null) {
    try {
      const provider = PaymentFactory.getProviderByName(providerName);
      return provider.verifyWebhookSignature(headers, body, rawBody);
    } catch (error) {
      logger.error(`Signature verification failed for ${providerName}`, {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Handle Webhook confirmation
   */
  async handleWebhook(providerName, headers, body, rawBody = null) {
    const provider = PaymentFactory.getProviderByName(providerName);

    // 0. Verify Signature if not already done in controller
    const isValid = provider.verifyWebhookSignature(headers, body, rawBody);
    if (!isValid) {
      logger.warn(`Invalid signature for ${providerName} webhook`);
      throw new Error("Invalid signature");
    }

    // 1. Parse Event
    const event = provider.parseWebhookEvent(body);
    logger.info(`Processing ${providerName} event`, {
      type: event.type,
      reference: event.reference,
      status: event.status,
    });

    if (event.status === "success") {
      return await this.finalizeTransaction(event.reference, event);
    } else if (event.status === "failed") {
      return await this.failTransaction(
        event.reference,
        "Payment failed at provider",
      );
    }

    return { status: "ignored" };
  }

  /**
   * Finalize transaction (Credit wallet, unlock ads, etc.)
   */
  async finalizeTransaction(reference, eventData = null) {
    const rawData = eventData?.raw || eventData;
    // 1. Fetch transaction with basic lock if possible (Supabase doesn't support forUpdate directly in client)
    // We use status check for idempotency
    const { data: tx, error: fetchError } = await supabase
      .from("transactions")
      .select("*")
      .or(`reference_id.eq.${reference},provider_reference.eq.${reference}`)
      .single();

    if (fetchError || !tx) {
      logger.error("Transaction not found for finalize", { reference });
      return { error: "Not found" };
    }

    // 2. IDEMPOTENCY CHECK
    // If already completed or failed with finality, stop here
    if (tx.status === "COMPLETED") {
      logger.info(`Transaction ${reference} already completed. Skipping.`);
      return { status: "already_completed" };
    }

    // 3. ATOMIC UPDATE (Match by ID and current status to prevent race conditions)
    const { data: updatedTx, error: updateError } = await supabase
      .from("transactions")
      .update({
        status: "COMPLETED",
        external_hash: rawData ? (rawData.payment_id || rawData.id) : null,
        display_label: eventData?.display_label || tx.display_label ||
          "Digital Assets Purchase",
        internal_coin: eventData?.internal_coin,
        internal_amount: eventData?.internal_amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tx.id)
      .eq("status", "PENDING") // Critical: only update if still pending
      .select()
      .single();

    if (updateError || !updatedTx) {
      // If update returned nothing, it means the status was likely changed by a concurrent process
      logger.warn(`Finalize: Atomic update failed or skip for ${reference}`, {
        error: updateError?.message,
      });
      return { status: "already_processed_or_failed" };
    }

    logger.info(`Transaction ${reference} finalized successfully.`, {
      type: tx.type,
      userId: tx.user_id,
    });

    // 2. Perform business logic based on type
    const metadata = tx.metadata || {};

    switch (tx.type) {
      case "DEPOSIT":
      case "FUNDING":
      case "Digital Assets Purchase":
        await this.creditUserWallet(tx.user_id, tx.amount, tx.currency, tx.id);
        break;
      case "AD_PAYMENT":
        await this.unlockAd(metadata.adId);
        break;
      case "SUBSCRIPTION":
        // Logic for subscription update
        logger.info("Subscription payment processed", {
          userId: tx.user_id,
          plan: metadata.plan,
        });
        break;
      default:
        logger.warn(`[PaymentService] Unknown transaction type: ${tx.type}`, {
          txId: tx.id,
        });
    }

    // 3. Send email receipt (Mock or call email service)
    await this.sendReceipt(tx.user_id, tx);

    return { status: "success" };
  }

  async failTransaction(reference, reason) {
    await supabase
      .from("transactions")
      .update({
        status: "FAILED",
        metadata: { failReason: reason },
        updated_at: new Date().toISOString(),
      })
      .eq("reference_id", reference);

    return { status: "failed" };
  }

  /**
   * Business Logic: Credit Wallet
   */
  async creditUserWallet(userId, amount, currency, transactionId) {
    logger.info(`[PaymentService] Crediting wallet`, {
      userId,
      amount,
      currency,
    });

    try {
      // Find wallet or create if doesn't exist
      let { data: wallet } = await supabase
        .from("wallets")
        .select("id")
        .eq("user_id", userId)
        .eq("currency", currency)
        .single();

      if (!wallet) {
        const { data: newWallet, error: createError } = await supabase
          .from("wallets")
          .insert({
            user_id: userId,
            currency,
            balance: 0,
            address: uuidv4(),
          })
          .select()
          .single();

        if (createError) throw createError;
        wallet = newWallet;
      }

      // Use atomic increment via RPC to avoid race conditions.
      const { error: rpcError } = await supabase.rpc("credit_wallet_atomic", {
        p_wallet_id: wallet.id,
        p_amount: parseFloat(amount),
      });

      if (rpcError) throw rpcError;

      // Update the transaction with the wallet_id if it wasn't there
      await supabase
        .from("transactions")
        .update({ wallet_id: wallet.id })
        .eq("id", transactionId);
    } catch (err) {
      logger.error("Credit Wallet Failed", {
        userId,
        amount,
        currency,
        error: err.message,
      });
      throw err;
    }
  }

  /**
   * Business Logic: Unlock Ad
   */
  async unlockAd(adId) {
    if (!adId) return;
    console.log(`[PaymentService] Unlocking ad ${adId}`);
    await supabase
      .from("ads")
      .update({ status: "pending" }) // Approved after admin review? Or 'active' directly?
      .eq("id", adId);
  }

  /**
   * Send Receipt
   */
  async sendReceipt(userId, transaction) {
    const label = transaction.display_label || "Digital Assets Purchase";
    logger.info(`Sending email receipt to user ${userId}`, {
      reference: transaction.reference_id,
      label,
    });

    // Fetch user email
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("id", userId)
      .single();

    if (profile && profile.email) {
      await mailService.sendPaymentReceipt(profile.email, transaction);
    }
  }
}

module.exports = new PaymentService();
