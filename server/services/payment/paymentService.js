const supabase = require("../../config/database");
const PaymentFactory = require("./PaymentFactory");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../utils/logger");
const mailService = require("../mailService");
const math = require("../../utils/mathUtils");

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
    const network = metadata.network || options.network || "native";
    const idempotencyKey = metadata.idempotencyKey;
    if (idempotencyKey) {
      try {
        const { data: existing } = await supabase
          .from("transactions")
          .select("*")
          .eq("idempotency_key", idempotencyKey)
          .single();

        if (existing) {
          logger.info("Found existing transaction for idempotency key", {
            idempotencyKey,
          });
          // Use existing reference if already initialized with provider
          return this.verifyPaymentStatus(existing.reference_id || existing.reference || "");
        }
      } catch (idErr) {
        // Fallback: If column missing or query fails, just proceed as a new transaction
        logger.info(`[PaymentService] Idempotency check failed (possibly missing column): ${idErr.message}`);
      }
    }

    const reference = `tx_${uuidv4().replace(/-/g, "")}`;
    const isCrypto = options.isCrypto || false;

    logger.info(`[DEBUG] Step 1: Provider selection for ${currency} (${isCrypto ? 'Crypto' : 'Fiat'})`);
    // 1. Determine provider via Factory or explicit request
    const provider = options.provider
      ? PaymentFactory.getProviderByName(options.provider)
      : PaymentFactory.getProvider(
        currency,
        metadata.region || "NG",
        isCrypto,
      );
    const providerName = provider.constructor.name.replace("Provider", "")
      .toLowerCase();

    logger.info(`[DEBUG] Step 2: Initializing ${providerName} payment`, {
      userId,
      reference,
      currency,
      amount,
      provider: providerName,
      isCrypto,
      network
    });

    // 2. Find or create wallet for this currency (Robust lookup for production schema differences)
    const lookupNetwork = network || "native";
    let wallet = null;
    let lookupError = null;

    try {
      const { data, error } = await supabase
        .from("wallets_store")
        .select("id")
        .eq("user_id", userId)
        .eq("currency", currency)
        .or(`network.eq.${lookupNetwork},network.is.null`)
        .maybeSingle();
      wallet = data;
      lookupError = error;

      // Fallback: If network column doesn't exist, retry with currency only
      if (lookupError && lookupError.code === "42703") {
        logger.info("[PaymentService] network column missing on prod, falling back to currency-only lookup");
        const { data: fallbackData, error: fallbackError } = await supabase
          .from("wallets_store")
          .select("id")
          .eq("user_id", userId)
          .eq("currency", currency)
          .maybeSingle();
        wallet = fallbackData;
        lookupError = fallbackError;
      }
    } catch (err) {
      lookupError = err;
    }

    if (lookupError) {
      logger.error("[PaymentService] Wallet lookup failed", { userId, currency, network, lookupError });
    }

    if (!wallet) {
      // IMPORTANT: Insert into wallets_store (the actual table), NOT wallets (which is a VIEW)
      let createError;
      let newWallet;

      const walletPayload = {
        user_id: userId,
        currency,
        address: `${currency}_${userId.substring(0, 8)}`,
      };

      // Only add network if it doesn't break prod
      if (network) walletPayload.network = network;

      let currentWalletPayload = { ...walletPayload };
      let walletAttempts = 0;

      // Robust Greedy Insertion: Automatically prune columns that don't exist in production
      while (walletAttempts < 5) {
        const { data: inserted, error: initialError } = await supabase
          .from("wallets_store")
          .insert(currentWalletPayload)
          .select()
          .single();
        
        if (!initialError) {
          newWallet = inserted;
          createError = null;
          break;
        }

        // 42703 = Undefined Column
        if (initialError.code === "42703") {
          const match = initialError.message.match(/column "(.+)"/);
          const columnName = match ? match[1] : null;

          if (columnName && currentWalletPayload.hasOwnProperty(columnName)) {
            logger.info(`[PaymentService] Pruning missing column '${columnName}' from wallets_store insert`);
            delete currentWalletPayload[columnName];
            walletAttempts++;
            continue;
          }
        }

        createError = initialError;
        break;
      }

      if (createError) {
        logger.error("Failed to create wallet for deposit", {
          createError,
          userId,
          currency,
          network,
        });
        throw new Error(`Failed to initialize ${currency} wallet`);
      }
      wallet = newWallet;
    }

    logger.info(`[DEBUG] Step 3: Wallet identification for ${currency}`);
    if (!wallet || !wallet.id) {
      logger.error("[PaymentService] Critical: Wallet object is null after create/find", { userId, currency, network });
      throw new Error(`Wallet identification failed for ${currency}. Please try again.`);
    }

    logger.info(`[DEBUG] Step 4: Creating payment record (${providerName})`);
    const payPayload = {
      user_id: userId,
      reference: reference,
      provider: providerName,
      amount: math.formatForCurrency(amount, currency),
      currency: currency,
      status: "pending",
      credited: false,
      metadata: { ...metadata, idempotencyKey },
    };

    let pAttempts = 0;
    let pError = null;
    let currentPayPayload = { ...payPayload };

    while (pAttempts < 10) {
      const { error } = await supabase
        .from("payments")
        .insert(currentPayPayload);
      
      if (!error) {
        pError = null;
        break;
      }

      if (error.code === "42703") {
        const match = error.message.match(/column "(.+)"/);
        const columnName = match ? match[1] : null;

        if (columnName && currentPayPayload.hasOwnProperty(columnName)) {
          logger.info(`[PaymentService] Pruning missing column '${columnName}' from payments insert`);
          delete currentPayPayload[columnName];
          pAttempts++;
          continue;
        }
      }

      pError = error;
      break;
    }

    if (pError) {
      logger.error("[DEBUG] Step 4 Failed: DB Error creating payment record", {
        error: pError,
        userId,
        reference,
      });
      // throw new Error("Failed to create payment record");
    }

    logger.info(`[DEBUG] Step 5: Creating transaction record`);
    // 4. Create transaction record in DB BEFORE initialization (Mandatory for Ledger)
    const targetCurrency = metadata.targetCurrency || currency;
    const targetNetwork = metadata.targetNetwork || network;

    const txPayload = {
      user_id: userId,
      wallet_id: wallet.id,
      amount: math.formatForCurrency(amount, currency),
      currency: currency,
      amount_from: math.formatForCurrency(amount, currency),
      amount_to: math.formatForCurrency(amount, currency),
      from_currency: currency,
      to_currency: targetCurrency,
      status: "PENDING",
      reference_id: reference,
      idempotency_key: idempotencyKey,
      provider: providerName,
      display_label: metadata.display_label || (targetCurrency !== currency ? `Purchase ${targetCurrency}` : "Digital Assets Purchase"),
      metadata: {
        ...metadata,
        userId,
        email,
        category: "digital_assets",
        product_type: "digital_asset",
        idempotencyKey,
        targetCurrency,
        targetNetwork,
      },
      type: isCrypto || targetCurrency !== currency
        ? "Digital Assets Purchase"
        : (metadata.type || "DEPOSIT"),
    };

    // Only add network if it doesn't break prod
    if (targetNetwork) txPayload.network = targetNetwork;

    let transaction = null;
    let txError = null;
    let currentPayload = { ...txPayload };
    let attempts = 0;

    // Robust Greedy Insertion: Automatically prune columns that don't exist in production
    while (attempts < 10) {
      const { data, error } = await supabase
        .from("transactions")
        .insert(currentPayload)
        .select()
        .single();
      
      if (!error) {
        transaction = data;
        txError = null;
        break;
      }

      // 42703 = Undefined Column
      if (error.code === "42703") {
        // Extract column name from error message: "column \"XYZ\" of relation \"transactions\" does not exist"
        const match = error.message.match(/column "(.+)"/);
        const columnName = match ? match[1] : null;

        if (columnName && currentPayload.hasOwnProperty(columnName)) {
          logger.info(`[PaymentService] Pruning missing column '${columnName}' from transactions insert`);
          delete currentPayload[columnName];
          attempts++;
          continue;
        }
      }

      txError = error;
      break;
    }

    if (txError) {
      logger.error("[DEBUG] Step 5 Failed: DB Error creating transaction", {
        error: txError,
        userId,
        reference,
      });
      throw new Error(`DB Error: ${txError.message || "Failed to create transaction record"}`);
    }

    logger.info(`[DEBUG] Step 6: Initializing with provider ${providerName}`);
    let initData = {};
    
    // 3. Initialize with provider
    const callbackUrl = options.callbackUrl ||
      `${
        process.env.CLIENT_URL || "https://notestandard.com"
      }/payment/success?reference=${reference}`;

    try {
      initData = await provider.initialize({
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

      if (initData.providerReference) {
        try {
          await supabase
            .from("transactions")
            .update({ provider_reference: initData.providerReference })
            .eq("id", transaction.id);
        } catch (updateErr) {
          logger.warn(`[PaymentService] Failed to update provider_reference: ${updateErr.message}`);
        }
      }
    } catch (error) {
      logger.error(`[PaymentService] Provider initialization failure: ${error.message}`, {
        reference,
        error: error.response?.data || error,
      });

      // Special handling for bank transfers vs other methods
      if (metadata.method !== "bank_transfer") {
        try {
          await supabase
            .from("transactions")
            .update({
              status: "FAILED",
              metadata: { ...transaction.metadata, error: error.message },
            })
            .eq("id", transaction.id);
        } catch (dbErr) {
          logger.error(`[PaymentService] Failed to mark transaction as FAILED: ${dbErr.message}`);
        }

        const enrichedError = new Error(`Payment Initialization Failed: ${error.message}`);
        enrichedError.details = error.response?.data || error;
        enrichedError.location = "PaymentService.initializePayment";
        throw enrichedError;
      }
      
      // For bank transfers, we might have partial success (e.g. virtual account created but checkout failed)
      // but usually we want to throw to let the user know.
      throw error;
    }

    return {
      url: initData.checkoutUrl || null,
      checkoutUrl: initData.checkoutUrl || null,
      paymentUrl: initData.paymentUrl || initData.checkoutUrl || null,
      payAddress: initData.payAddress || null,
      reference: reference,
      provider: providerName,
      provider_reference: initData.providerReference || null
    };
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
   * Execute Webhook core business logic (Delegated from BaseProvider)
   */
  async executeWebhookAction(event, body, providerName) {
    logger.info(`Processing ${providerName} event`, {
      type: event.type,
      reference: event.reference,
      status: event.status,
    });

    let result;

    // Distinguish between incoming payments (deposits) and outbound/conversions (withdrawals/swaps)
    const isPayout = event.type === "transfer" ||
      event.type === "payout" ||
      body.event === "transfer.completed" ||
      body.event === "transfer.failed";
    const isConversion = event.type === "conversion" ||
      body.type === "conversion";

    if (isPayout || body.event?.startsWith("transfer.")) {
      // Handle Withdrawal Finalization
      const status = event.status === "success" ||
          body.event === "transfer.completed" ||
          body.data?.status === "SUCCESSFUL"
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
      // Default to Deposit Finalization
      if (
        event.status === "success" ||
        body.event === "charge.completed" ||
        body.data?.status === "successful"
      ) {
        // RE-VERIFY with gateway API before finalizing (Industry Standard)
        result = await this.verifyPaymentStatus(event.reference);
      } else if (
        event.status === "failed" ||
        body.event === "charge.failed"
      ) {
        result = await this.failTransaction(
          event.reference,
          "Payment failed at provider",
        );
      }
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

    // 2. IDEMPOTENCY CHECK (using both tables for safety)
    const { data: payRecord } = await supabase
      .from("payments")
      .select("status, credited")
      .eq("reference", reference)
      .single();

    if (tx.status?.toUpperCase() === "COMPLETED" || payRecord?.credited) {
      console.log(
        `[Finalize] Transaction ${reference} already completed or credited. Skipping.`,
      );
      return { status: "already_completed" };
    }

    console.log("STEP 2: Verification passed");

    // 2a. Validate Verification Amount & Currency (if provided by eventData)
    const evAmount = rawData?.amount || eventData?.amount;
    const evCurrency = rawData?.currency || eventData?.currency ||
      rawData?.currency_code || eventData?.payment_type;

    if (evAmount !== undefined && evAmount !== null) {
      if (!math.isEqual(tx.amount, evAmount)) {
        console.error(
          `[Finalize] Amount mismatch for ${reference}. DB: ${tx.amount}, Provider: ${evAmount}`,
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

    // Define safeAmount for internal logic
    const safeAmount = evAmount !== undefined && evAmount !== null ? evAmount : tx.amount;

    const isDeposit = ["DEPOSIT", "FUNDING", "Digital Assets Purchase"]
      .includes(tx.type?.toUpperCase() || tx.type);

    if (isDeposit) {
      console.log("STEP 3: Calling confirm_deposit");

      let targetWalletId = tx.wallet_id;
      let creditAmount = safeAmount;
      let creditCurrency = tx.currency;

      // Handle Direct Fiat-to-Crypto Purchase
      if (tx.from_currency !== tx.to_currency && (tx.type === "Digital Assets Purchase" || tx.type === "DIGITAL ASSETS PURCHASE")) {
        console.log(`[Finalize] Direct Purchase detected: ${tx.from_currency} -> ${tx.to_currency}`);
        try {
          const fxService = require("../fxService");
          const walletService = require("../walletService");
          
          const rate = await fxService.getRate(tx.from_currency, tx.to_currency);
          creditAmount = math.multiply(safeAmount, rate);
          creditCurrency = tx.to_currency;

          // Find or create the target wallet
          const targetWallet = await walletService.createWallet(tx.user_id, tx.to_currency, tx.network);
          targetWalletId = targetWallet.id;

          console.log(`[Finalize] Converted ${safeAmount} ${tx.from_currency} to ${creditAmount} ${creditCurrency} at rate ${rate}`);
          
          // Update transaction with conversion details
          await supabase.from("transactions").update({
            amount_to: math.formatForCurrency(creditAmount, creditCurrency),
            metadata: { 
              ...tx.metadata, 
              applied_rate: rate,
              original_fiat_amount: safeAmount,
              original_fiat_currency: tx.from_currency
            }
          }).eq("id", tx.id);

        } catch (convErr) {
          console.error(`[Finalize] Conversion failed for direct purchase: ${convErr.message}`);
          return { status: "verification_failed", error: "Conversion failed during finalization" };
        }
      }

      const externalHash = rawData
        ? (rawData.payment_id || rawData.id || rawData.tx_ref || null)
        : null;

      // ── USE confirm_deposit RPC (atomic: wallets_store + transactions + ledger_entries) ──
      const { error: rpcError } = await supabase.rpc("confirm_deposit", {
        p_transaction_id: tx.id,
        p_wallet_id: targetWalletId,
        p_amount: math.formatForCurrency(creditAmount, creditCurrency),
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

      // ── Update payments table status ──
      await supabase
        .from("payments")
        .update({
          status: "success",
          credited: true,
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("reference", reference);

      console.log("STEP 4: Wallet credited and payment marked successfully");
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

    // Sync with payments table
    await supabase
      .from("payments")
      .update({
        status: "failed",
        metadata: { failReason: reason },
        updated_at: new Date().toISOString(),
      })
      .eq("reference", reference);

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
        p_amount: math.formatForCurrency(amount, currency),
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
