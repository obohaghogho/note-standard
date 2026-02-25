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
    const idempotencyKey = metadata.idempotencyKey;
    if (idempotencyKey) {
      const { data: existing } = await supabase
        .from("transactions")
        .select("*")
        .eq("metadata->>idempotencyKey", idempotencyKey)
        .single();

      if (existing) {
        logger.info("Found existing transaction for idempotency key", {
          idempotencyKey,
        });
        // Use existing reference if already initialized with provider
        return this.verifyPaymentStatus(existing.reference_id);
      }
    }

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

    // 2. Find or create wallet for this currency
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
          address: `internal_${userId.substring(0, 8)}_${currency}`,
        })
        .select()
        .single();

      if (createError) {
        logger.error("Failed to create wallet for deposit", {
          createError,
          userId,
          currency,
        });
        throw new Error("Failed to initialize wallet for payment");
      }
      wallet = newWallet;
    }

    // 3. Create transaction record in DB BEFORE initialization (Mandatory)
    // Updated to support Core Ledger Architecture
    const { data: transaction, error: txError } = await supabase
      .from("transactions")
      .insert({
        user_id: userId,
        wallet_id: wallet.id, // Linking to wallet is critical for Ledger trigger
        amount: parseFloat(amount), // legacy
        currency: currency, // legacy
        amount_from: parseFloat(amount), // ledger
        amount_to: parseFloat(amount), // ledger
        from_currency: currency, // ledger
        to_currency: currency, // ledger
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
          idempotencyKey,
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

    // 0. Log Webhook for Audit Trail
    let logId;
    try {
      const { data: logEntry } = await supabase
        .from("webhook_logs")
        .insert({
          provider: providerName,
          payload: body,
          headers: headers,
          reference: body.order_id || body.payment_id || body.reference ||
            body.data?.reference,
          ip_address: headers["x-forwarded-for"] || "unknown",
        })
        .select("id")
        .single();
      logId = logEntry?.id;
    } catch (err) {
      logger.error("Failed to log webhook", {
        error: err.message,
        provider: providerName,
      });
    }

    // 1. Verify Signature
    const isValid = provider.verifyWebhookSignature(headers, body, rawBody);
    if (!isValid) {
      logger.warn(`Invalid signature for ${providerName} webhook`);

      // LOG SECURITY EVENT
      await supabase.from("security_audit_logs").insert({
        event_type: "INVALID_WEBHOOK_SIGNATURE",
        severity: "WARN",
        description: `Invalid signature for ${providerName} webhook from IP: ${
          headers["x-forwarded-for"] || "unknown"
        }`,
        payload: {
          provider: providerName,
          reference: body.reference || body.id,
        },
        ip_address: headers["x-forwarded-for"] || "unknown",
      });

      if (logId) {
        await supabase.from("webhook_logs").update({
          processing_error: "Invalid signature",
        }).eq("id", logId);
      }
      throw new Error("Invalid signature");
    }

    // 2. Parse Event
    const event = provider.parseWebhookEvent(body);
    logger.info(`Processing ${providerName} event`, {
      type: event.type,
      reference: event.reference,
      status: event.status,
    });

    let result;
    if (event.status === "success") {
      result = await this.finalizeTransaction(event.reference, event);
    } else if (event.status === "failed") {
      result = await this.failTransaction(
        event.reference,
        "Payment failed at provider",
      );
    }

    // 3. Mark as processed
    if (logId) {
      await supabase.from("webhook_logs").update({
        processed: true,
        processing_error: result?.error || null,
      }).eq("id", logId);
    }

    return result || { status: "ignored" };
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

    // 2. Perform business logic based on type (Side effects ONLY)
    // Wallet balances are automatically updated by DB triggers when status -> COMPLETED
    const metadata = tx.metadata || {};

    switch (tx.type) {
      case "DEPOSIT":
      case "FUNDING":
      case "Digital Assets Purchase":
        // No action needed here, DB trigger handled the balance.
        logger.info("Deposit finalized via ledger trigger", { txId: tx.id });
        break;
      case "AD_PAYMENT":
        await this.unlockAd(metadata.adId);
        break;
      case "SUBSCRIPTION_PAYMENT":
      case "SUBSCRIPTION":
        // Handle subscription activation (plan tiers, expiration, etc.)
        try {
          const { data: profile } = await supabase
            .from("profiles")
            .select("plan")
            .eq("id", tx.user_id)
            .single();

          const newPlan = metadata.plan || "PRO";
          if (profile?.plan !== newPlan) {
            await supabase
              .from("profiles")
              .update({ plan: newPlan })
              .eq("id", tx.user_id);

            // Record in subscription_transactions if possible
            await supabase.from("subscription_transactions").insert({
              user_id: tx.user_id,
              transaction_id: tx.id,
              event_type: "upgrade",
              plan_to: newPlan,
              status: "completed",
            });
          }
        } catch (subErr) {
          logger.error("Failed to update user subscription plan", {
            error: subErr.message,
          });
        }
        break;
      default:
        logger.warn(
          `[PaymentService] No additional logic for type: ${tx.type}`,
          {
            txId: tx.id,
          },
        );
    }

    // 3. Send email receipt (Mock or call email service)
    await this.sendReceipt(tx.user_id, tx);

    // 4. Send In-App Notification
    try {
      const { createNotification } = require("../notificationService"); // Use local path or service path
      await createNotification({
        receiverId: tx.user_id,
        senderId: null, // System notification
        type: "payment_success",
        title: "Payment Successful",
        message: `Your payment of ${tx.amount} ${tx.currency} for ${
          tx.display_label || "your deposit"
        } has been confirmed.`,
        link: `/dashboard/wallet`,
        // io: // io is hard to pass here without refactoring, but createNotification handles persistence
      });
    } catch (notifErr) {
      logger.error("Failed to send payment notification:", notifErr.message);
    }

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
   * Business Logic: Credit Wallet (Internal System Credit)
   * This should ONLY be used for manual admin adjustments or special rewards.
   */
  async creditUserWallet(userId, amount, currency, transactionId = null) {
    logger.info(`[PaymentService] Requesting system credit`, {
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
            address: `internal_${userId.substring(0, 8)}_${currency}`,
          })
          .select()
          .single();

        if (createError) throw createError;
        wallet = newWallet;
      }

      // Use the ledger-pure RPC. It creates a 'DEPOSIT' record (System Credit).
      const { error: rpcError } = await supabase.rpc("credit_wallet_atomic", {
        p_wallet_id: wallet.id,
        p_amount: parseFloat(amount),
      });

      if (rpcError) throw rpcError;
    } catch (err) {
      logger.error("System Credit Failed", {
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
    logger.info(`[PaymentService] Unlocking ad`, { adId });
    await supabase.from("ads").update({ status: "active", paid: true }).eq(
      "id",
      adId,
    );
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
