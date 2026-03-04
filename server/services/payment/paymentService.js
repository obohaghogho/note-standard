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
    network = "native",
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
      .eq("network", network)
      .single();

    if (!wallet) {
      const { data: newWallet, error: createError } = await supabase
        .from("wallets")
        .insert({
          user_id: userId,
          currency,
          network,
          address: `internal_${userId.substring(0, 8)}_${currency}_${network}`,
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
        network: network,
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
        }/payment/success?reference=${reference}`;

      const initData = await provider.initialize({
        email,
        amount,
        currency,
        network,
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
        checkoutUrl: initData.checkoutUrl, // Client expects this name
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
  async verifyPaymentStatus(reference, externalId = null) {
    let query = supabase.from("transactions").select("*");

    if (reference) {
      query = query.eq("reference_id", reference);
    } else if (externalId) {
      // If no internal reference provided, try to find by provider_reference
      query = query.eq("provider_reference", externalId);
    } else {
      return null;
    }

    const { data: tx, error } = await query.maybeSingle();

    if (error || !tx) {
      // If we still can't find it but we have an externalId,
      // it might be a new transaction we haven't linked yet,
      // or we need to verify with provider first to GET the reference.
      // But for now, we expect the transaction to exist.
      return null;
    }

    // If already completed or failed, just return
    if (tx.status !== "PENDING") return tx;

    try {
      const provider = PaymentFactory.getProviderByName(tx.provider);
      // Use externalId if provided, otherwise provider_reference, finally reference_id
      const queryRef = externalId || tx.provider_reference || tx.reference_id;

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

    // Distinguish between incoming payments (deposits) and outbound/conversions (withdrawals/swaps)
    // NOWPayments uses payment_status for deposits, but status for payouts/conversions.
    // Flutterwave uses event.type === 'transfer.completed' for payouts.

    // Check if this is a Payout/Withdrawal event
    const isPayout = event.type === "transfer" || event.type === "payout" ||
      body.event === "transfer.completed" || body.event === "transfer.failed";
    const isConversion = event.type === "conversion" ||
      body.type === "conversion"; // Add proper mapping based on provider later

    if (isPayout || body.event?.startsWith("transfer.")) {
      // Handle Withdrawal Finalization
      const status =
        (event.status === "success" || body.event === "transfer.completed" ||
            body.data?.status === "SUCCESSFUL")
          ? "SUCCESS"
          : "FAILED";
      const externalHash = event.reference || body.data?.id;

      const { error: rpcError } = await supabase.rpc(
        "finalize_external_withdrawal",
        {
          p_external_payout_id: String(
            body.data?.id || body.id || event.reference,
          ),
          p_status: status,
          p_provider_hash: String(externalHash),
        },
      );

      if (rpcError) {
        logger.error("Failed to finalize withdrawal", {
          error: rpcError.message,
          reference: event.reference,
        });
        result = { error: rpcError.message };
      } else {
        result = { status: "success" };
      }
    } else if (isConversion) {
      // Handle Swap Finalization
      const status = event.status === "success" ? "SUCCESS" : "FAILED";
      const externalHash = event.reference || body.id;

      const { error: rpcError } = await supabase.rpc(
        "finalize_external_conversion",
        {
          p_external_conversion_id: String(body.id || event.reference),
          p_status: status,
          p_provider_hash: String(externalHash),
        },
      );

      if (rpcError) {
        logger.error("Failed to finalize conversion", {
          error: rpcError.message,
          reference: event.reference,
        });
        result = { error: rpcError.message };
      } else {
        result = { status: "success" };
      }
    } else {
      // Default to Deposit Finalization (Existing logic)
      if (
        event.status === "success" || body.event === "charge.completed" ||
        body.data?.status === "successful"
      ) {
        result = await this.finalizeTransaction(event.reference, event);
      } else if (event.status === "failed" || body.event === "charge.failed") {
        result = await this.failTransaction(
          event.reference,
          "Payment failed at provider",
        );
      }
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
  /**
   * Finalize transaction (Credit wallet, unlock ads, etc.)
   */
  async finalizeTransaction(reference, eventData = null) {
    console.log(`\n--- START FINALIZE TRANSACTION [${reference}] ---`);
    const rawData = eventData?.raw || eventData;

    console.log("STEP 1: Found transaction");

    // 1. Fetch transaction safely using unique reference_id
    const { data: tx, error: fetchError } = await supabase
      .from("transactions")
      .select("*")
      .eq("reference_id", reference)
      .single();

    if (fetchError || !tx) {
      console.error(
        `[Finalize] Transaction not found for reference: ${reference}`,
        fetchError?.message,
      );
      return { status: "verification_failed", error: "Transaction not found" };
    }

    // 2. IDEMPOTENCY CHECK
    if (tx.status?.toUpperCase() === "COMPLETED") {
      console.log(
        `[Finalize] Transaction ${reference} already completed. Skipping.`,
      );
      return { status: "already_completed" };
    }

    console.log("STEP 2: Verification passed");

    // 2a. Validate Verification Amount & Currency (if provided by eventData)
    const evAmount = rawData?.amount || eventData?.amount;
    const evCurrency = rawData?.currency || eventData?.currency ||
      rawData?.currency_code || eventData?.payment_type;

    if (evAmount !== undefined && evAmount !== null) {
      const dbAmount = parseFloat(tx.amount);
      const providerAmount = parseFloat(evAmount);

      if (isNaN(providerAmount) || dbAmount !== providerAmount) {
        console.error(
          `[Finalize] Amount mismatch for ${reference}. DB: ${dbAmount}, Provider: ${providerAmount}`,
        );
        return {
          status: "verification_failed",
          error: "Amount mismatch between provider and database",
        };
      }
    }

    if (evCurrency) {
      if (
        String(tx.currency).toUpperCase() !== String(evCurrency).toUpperCase()
      ) {
        console.error(
          `[Finalize] Currency mismatch for ${reference}. DB: ${tx.currency}, Provider: ${evCurrency}`,
        );
        return {
          status: "verification_failed",
          error: "Currency mismatch between provider and database",
        };
      }
    }

    const isDeposit = ["DEPOSIT", "FUNDING", "Digital Assets Purchase"]
      .includes(tx.type?.toUpperCase() || tx.type);

    if (isDeposit) {
      console.log("STEP 3: Calling confirm_deposit");

      if (!tx.wallet_id) {
        console.error(
          `[Finalize] Missing wallet_id for transaction ${tx.id}. Cannot credit wallet.`,
        );
        return { status: "verification_failed", error: "Missing wallet_id" };
      }

      const safeAmount = parseFloat(tx.amount);
      if (isNaN(safeAmount) || safeAmount <= 0) {
        console.error(`[Finalize] Invalid transaction amount: ${tx.amount}`);
        return { status: "verification_failed", error: "Invalid amount" };
      }

      const externalHash = rawData
        ? (rawData.payment_id || rawData.id || rawData.tx_ref || null)
        : null;

      // ── USE confirm_deposit RPC (atomic: wallets_store + transactions + ledger_entries) ──
      const { error: rpcError } = await supabase.rpc("confirm_deposit", {
        p_transaction_id: tx.id,
        p_wallet_id: tx.wallet_id,
        p_amount: safeAmount,
        p_external_hash: externalHash ? String(externalHash) : null,
      });

      if (rpcError) {
        console.error(
          `[Finalize] confirm_deposit RPC failed for ${reference}:`,
          rpcError.message || rpcError,
        );

        // Handle specific idempotent exceptions from the SQL RPC
        if (
          rpcError.message?.includes("already completed") ||
          rpcError.message?.includes("already")
        ) {
          console.log(
            `[Finalize] Transaction ${reference} was completed concurrently inside RPC.`,
          );
          return { status: "already_completed" };
        }

        return { status: "rpc_failed", error: rpcError.message };
      }

      console.log("STEP 4: Wallet credited successfully");
    } else {
      // ── NON-DEPOSIT types: manual update (subscriptions, ads, etc.) ──
      console.log(`STEP 3: Updating Non-Deposit Transaction (${tx.type})`);

      const externalHash = rawData ? (rawData.payment_id || rawData.id) : null;

      const { data: updatedTx, error: updateError } = await supabase
        .from("transactions")
        .update({
          status: "COMPLETED",
          external_hash: externalHash ? String(externalHash) : null,
          display_label: eventData?.display_label || tx.display_label ||
            "Payment",
          internal_coin: eventData?.internal_coin,
          internal_amount: eventData?.internal_amount,
          updated_at: new Date().toISOString(),
        })
        .eq("id", tx.id)
        .neq("status", "COMPLETED")
        .select()
        .single(); // Enforce we actually updated the row

      if (updateError || !updatedTx) {
        console.warn(
          `[Finalize] Atomic update failed or skip for ${reference}. Concurrent process won.`,
          updateError?.message,
        );
        return { status: "already_completed" };
      }
      console.log("STEP 4: Non-Deposit record updated successfully");
    }

    // 4. Perform business logic based on type (Side effects ONLY)
    const metadata = tx.metadata || {};

    switch (tx.type?.toUpperCase() || tx.type) {
      case "DEPOSIT":
      case "FUNDING":
      case "Digital Assets Purchase":
      case "DIGITAL ASSETS PURCHASE":
        break; // Core processed via RPC
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
