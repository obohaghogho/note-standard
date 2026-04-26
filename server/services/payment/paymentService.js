const supabase = require("../../config/database");
const PaymentFactory = require("./PaymentFactory");
const LockService = require("./LockService");
const { v4: uuidv4 } = require("uuid");
const logger = require("../../utils/logger");
const mailService = require("../mailService");
const math = require("../../utils/mathUtils");
const { getCallbackUrl } = require("../../utils/url_utils");
const realtime = require("../realtimeService");
const SystemState = require("../../config/SystemState");

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
    const method = metadata.method || options.method || "card";

    logger.info(`[DEBUG] Step 1: Provider selection for ${currency} (${isCrypto ? 'Crypto' : 'Fiat'}) method: ${method}`);
    // 1. Determine provider via Factory or explicit request
    const provider = options.provider
      ? PaymentFactory.getProviderByName(options.provider)
      : PaymentFactory.getProvider(
        currency,
        metadata.region || "NG",
        isCrypto,
        method,
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

    console.time(`[PaymentService] WalletLookup:${userId}`);
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
    console.timeEnd(`[PaymentService] WalletLookup:${userId}`);

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
        // Handle race condition: Unique violation (23505)
        if (createError.code === "23505") {
          logger.info(`[PaymentService] Race condition: Wallet already created for ${userId} (${currency})`);
          const { data: retry } = await supabase
            .from("wallets_store")
            .select("*")
            .eq("user_id", userId)
            .eq("currency", currency)
            .maybeSingle();
          if (retry) {
            wallet = retry;
            createError = null;
          }
        }
      }

      if (createError) {
        logger.error("Failed to create wallet for deposit", {
          createError,
          userId,
          currency,
          network,
        });
        const err = new Error(`Failed to initialize ${currency} wallet: ${createError.message || "Unknown DB Error"}`);
        err.details = createError;
        err.location = "PaymentService.walletInitialization";
        throw err;
      }
      if (!wallet) wallet = newWallet;
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

    console.time(`[PaymentService] PaymentInsert:${reference}`);
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
    console.timeEnd(`[PaymentService] PaymentInsert:${reference}`);

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
    console.time(`[PaymentService] TransactionInsert:${reference}`);
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
    console.timeEnd(`[PaymentService] TransactionInsert:${reference}`);

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
    
    const callbackUrl = options.callbackUrl || getCallbackUrl("/activity/success", { reference }, providerName);

    console.time(`[PaymentService] ProviderInit:${providerName}`);
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
      console.timeEnd(`[PaymentService] ProviderInit:${providerName}`);

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
      url: initData.link || initData.checkoutUrl || null,
      checkoutUrl: initData.link || initData.checkoutUrl || null,
      paymentUrl: initData.paymentUrl || initData.link || initData.checkoutUrl || null,
      link: initData.link || initData.checkoutUrl || null,
      payAddress: initData.payAddress || null,
      instructions: initData.instructions || null, // For manual providers like Grey
      reference: reference,
      provider: providerName,
      provider_reference: initData.providerReference || null
    };
  }

  /**
   * Verify and update a single transaction status (STRICT CONTRACT v6.0)
   */
  async verifyPaymentStatus(reference, externalId = null) {
    logger.info(`[PaymentService] VERIFY START for ${reference}`);
    
    let query = supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false });

    if (reference && externalId) {
      query = query.or(`reference_id.eq.${reference},provider_reference.eq.${reference},provider_reference.eq.${externalId},reference_id.eq.${externalId}`);
    } else if (reference) {
      query = query.or(`reference_id.eq.${reference},provider_reference.eq.${reference}`);
    } else if (externalId) {
      query = query.or(`provider_reference.eq.${externalId},reference_id.eq.${externalId}`);
    } else {
      return { status: "FAILED", error: "Missing reference" };
    }

    const { data: tx, error } = await query.maybeSingle();

    if (!tx || error) {
      logger.warn(`[PaymentService] No transaction found for ref: ${reference}`);
      return { status: "NOT_FOUND" };
    }

    // If already finalized, return normalized status immediately
    const terminalStatus = tx.status?.toUpperCase();
    if (["COMPLETED", "SUCCESS", "FAILED"].includes(terminalStatus)) {
      return { 
        status: terminalStatus === "SUCCESS" ? "COMPLETED" : terminalStatus,
        transactionId: tx.id,
        amount: tx.amount,
        currency: tx.currency
      };
    }

    try {
      const provider = PaymentFactory.getProviderByName(tx.provider);
      const queryRef = externalId || tx.provider_reference || tx.reference_id;

      const verification = await provider.verify(queryRef);
      logger.info(`[PaymentService] PROVIDER VERIFIED SUCCESS: ${reference} -> ${verification.status}`);

      if (verification.status === "success") {
        return await this.finalizeTransaction(reference, verification);
      } else if (["failed", "abandoned", "expired"].includes(verification.status)) {
        return await this.failTransaction(reference, `Provider reported failure: ${verification.status}`);
      }

      // Default: Return current DB status if in-flight
      return { 
        status: (tx.status || "PENDING").toUpperCase(),
        transactionId: tx.id
      };
    } catch (err) {
      logger.error(`[PaymentService] Status verification failed for ${reference}:`, err.message);
      return { status: (tx.status || "PENDING").toUpperCase(), error: err.message };
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
   * This is the CANONICAL ENTRYPOINT for all mutation webhooks.
   * Tier 1 Mutex: Transaction-level lock.
   */
  async executeWebhookAction(event, body, providerName) {
    const eventId = event.transactionId || event.reference || "event_root";

    // 1. FINAL IDEMPOTENCY GUARD (DB Unique Index backup)
    const { data: processedEvent } = await supabase
      .from("webhook_events")
      .select("id, status")
      .eq("external_id", eventId)
      .maybeSingle();

    if (processedEvent && processedEvent.status === 'success') {
      logger.info(`[PaymentService] Idempotency Win: Event ${eventId} already SUCCESSFUL.`);
      return { status: "already_completed" };
    }

    // 2. EXECUTION KERNEL
    // We perform the actual wallet/ledger mutation here.
    const result = await this._internalExecuteMutation(event, body, providerName);

    // 3. ENROLLMENT (Idempotency Record)
    // Only if the mutation was successful, we "seal" the event.
    if (result && result.status !== 'ignored' && result.status !== 'failed') {
      try {
        await supabase.from("webhook_events").upsert({
          external_id: eventId,
          provider: providerName,
          status: 'success',
          processed_at: new Date(),
          metadata: { 
            event_type: event.type,
            result_status: result.status,
            transaction_id: result.transactionId
          }
        }, { onConflict: 'external_id' });
      } catch (enrollErr) {
        logger.error(`[CRITICAL] Mutation Succeeded but Enrollment Failed: ${eventId}`, { error: enrollErr.message });
        throw new Error(`ENROLLMENT_FAILURE: Mutation persisted but idempotency record failed. Manual audit required.`);
      }
    }

    return result;
  }

  async _internalExecuteMutation(event, body, providerName) {
    logger.info(`Processing ${providerName} event inside Tier 1 Lock`, {
      type: event.type,
      reference: event.reference,
      status: event.status,
    });

    // ── Task 2.c: Declarative Invariant Verification ──────────────────
    const InvariantRegistry = require("./InvariantRegistry");
    const { data: latestTx } = await supabase
        .from("transactions")
        .select("id")
        .eq("wallet_id", event.walletId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

    if (latestTx) {
        const violations = await InvariantRegistry.verifyAll({
            walletId: event.walletId,
            versionId: latestTx.id,
            event
        });

        const criticalViolation = violations.find(v => !v.valid);
        if (criticalViolation) {
            throw new Error(`INVARIANT_VIOLATION: Rule ${criticalViolation.rule} blocked mutation.`);
        }
    }

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
        logger.error("Failed to finalize withdrawal (HARD_FAIL)", {
          error: rpcError.message,
          reference: event.reference,
        });
        throw new Error(`WITHDRAWAL_FINALIZATION_FAILED: ${rpcError.message}`);
      } else {
        result = { status: "success" };
      }
    } else if (isConversion || event.type === "FX_CONVERSION") {
      // Handle FX Swap Finalization
      const status = event.status === "success" ||
          body.status === "COMPLETED" ||
          body.data?.status === "SUCCESSFUL"
        ? "SUCCESS"
        : "FAILED";
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
        logger.error("Failed to finalize conversion (HARD_FAIL)", {
          error: rpcError.message,
          reference: event.reference,
        });
        throw new Error(`CONVERSION_FINALIZATION_FAILED: ${rpcError.message}`);
      } else {
        result = { status: "success" };
      }
    } else if (event.type === "SUBSCRIPTION_CANCELLATION") {
      // Handle subscription cancellation
      const userId = event.userId || body.data?.metadata?.userId;
      if (userId) {
        try {
          await supabase.from("subscriptions").update({ status: "canceled", plan_tier: "free" }).eq("user_id", userId);
          await supabase.from("profiles").update({ plan_tier: "free" }).eq("id", userId);
          result = { status: "cancelled" };
        } catch (err) {
          result = { error: err.message };
        }
      }
    } else {
      // Default to Deposit Finalization
      if (
        event.status === "success" ||
        body.event === "charge.success" ||      // Paystack canonical event name
        body.event === "charge.completed" ||    // legacy / other providers
        body.event === "charge.successful" ||   // legacy / other providers
        body.data?.status === "successful" ||
        body.data?.status === "success"         // Paystack uses lowercase "success"
      ) {
        result = await this.finalizeTransaction(event.reference, event);
      } else if (event.status === "failed") {
        result = await this.failTransaction(event.reference, "Payment failed");
      }
    }

    return result || { status: "ignored" };
  }


  /**
  /**
   * Finalize transaction (Strict v6.0 Consolidated Core Lane)
   * This is the authoritative settlement engine.
   */
  async finalizeTransaction(reference, eventData = null) {
    logger.info(`[PaymentService] FINALIZATION START for ${reference}`);
    
    return await LockService.withLock(reference, async () => {
        // 1. Fetch transaction record
        const { data: tx, error: fetchError } = await supabase
          .from("transactions")
          .select("*")
          .or(`reference_id.eq.${reference},provider_reference.eq.${reference}`)
          .single();

        if (fetchError || !tx) {
          logger.error(`[Finalize] Transaction not found: ${reference}`);
          return { status: "FAILED", error: "TRANSACTION_NOT_FOUND" };
        }

        // 2. IDEMPOTENCY GUARD
        if (["COMPLETED", "SUCCESS"].includes(tx.status?.toUpperCase())) {
          logger.info(`[Finalize] Idempotency Hit for ${reference}. Already COMPLETED.`);
          return {
            status: "COMPLETED",
            transactionId: tx.id,
            amount: tx.amount,
            walletId: tx.wallet_id
          };
        }

        // 3. CORE LANE SETTLEMENT (Strictly Fiat / Ledger Purity)
        // Rule: Internal deposits/purchases use VERIFIED amount directly. No FX service.
        // Safety Guard: In sandbox, Paystack auto-converts USD -> NGN. 
        // We must ensure we don't credit NGN amounts to a USD wallet.
        let settlementAmount = tx.amount;
        if (eventData?.amount && (!eventData.currency || eventData.currency === tx.currency)) {
            settlementAmount = eventData.amount;
        } else if (eventData?.amount && eventData.currency !== tx.currency) {
            logger.warn(`[Finalize] Currency mismatch for ${reference}: Provider returned ${eventData.currency}, DB has ${tx.currency}. Fallback to DB amount: ${tx.amount}`);
        }
        
        logger.info(`[Finalize] Executing Journaled Settlement [confirm_deposit] for ${reference}`);
        
        const { data: rpcApplied, error: rpcError } = await supabase.rpc("confirm_deposit", {
            p_transaction_id: tx.id,
            p_wallet_id: tx.wallet_id,
            p_amount: settlementAmount,
            p_external_hash: eventData?.reference || reference
        });

        if (rpcError) {
            logger.error(`[Finalize] RPC FAILURE for ${reference}: ${rpcError.message}`);
            throw rpcError;
        }

        logger.info(`[Finalize] RPC SUCCESS for ${reference} (Applied: ${rpcApplied})`);

        // 4. ATOMIC STATE TERMINATION
        const { data: finalizedTx, error: updateError } = await supabase
          .from("transactions")
          .update({ 
            status: "COMPLETED",
            updated_at: new Date(),
            metadata: { 
                ...tx.metadata, 
                finalized_at: new Date(),
                settlement_applied: rpcApplied,
                locked: true
            }
          })
          .eq("id", tx.id)
          .select()
          .single();

        if (updateError) {
            logger.error(`[Finalize] Status Update Failed for ${reference}: ${updateError.message}`);
            throw updateError;
        }

        logger.info(`[Finalize] STATUS UPDATED TO COMPLETED for ${reference}`);

        // 5. POST-SETTLEMENT SIDE EFFECTS (Non-blocking background chain)
        // We do not await these to keep the mutex lock duration at minimum
        setImmediate(async () => {
            try {
                // A. Handle Business logic (Ads, Subscriptions)
                const type = finalizedTx.type?.toUpperCase();
                if (type === "AD_PAYMENT" && finalizedTx.metadata?.adId) {
                    await this.unlockAd(finalizedTx.metadata.adId);
                } else if (type === "SUBSCRIPTION_PAYMENT" || type === "SUBSCRIPTION") {
                    await this._activateSubscription(finalizedTx);
                }

                // B. Notifications & Receipts (Deferred for performance)
                await this.sendReceipt(finalizedTx.user_id, finalizedTx);
                
                const { createNotification } = require("../notificationService");
                await createNotification({
                    receiverId: finalizedTx.user_id,
                    type: "payment_success",
                    title: `Payment Confirmed`,
                    message: `Your payment for ${finalizedTx.display_label || "your deposit"} has been confirmed.`,
                    link: `/dashboard/wallet`,
                });

                // C. Real-time Broadcast
                await realtime.emitToUser(finalizedTx.user_id, "balance_updated", {
                    userId: finalizedTx.user_id,
                    transactionId: finalizedTx.id,
                    amount: finalizedTx.amount,
                    currency: finalizedTx.currency,
                    newStatus: "COMPLETED"
                });
            } catch (sideEffectErr) {
                logger.error(`[Finalize] Post-settlement side effects failed (Non-critical): ${sideEffectErr.message}`);
            }
        });

        return {
          status: "COMPLETED",
          transactionId: finalizedTx.id,
          amount: finalizedTx.amount,
          walletId: finalizedTx.wallet_id
        };
    }, { ttl: 30000, retryWindow: 5000 });
  }

  /**
   * Helper: Activate Subscription after payment confirmation
   */
  async _activateSubscription(tx) {
    const metadata = tx.metadata || {};
    const newPlan = metadata.plan || "PRO";
    const planTier = newPlan.toLowerCase();
    const now = new Date();
    const endDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const subData = {
      plan_tier: planTier,
      plan_type: newPlan.toUpperCase(),
      status: "active",
      start_date: now.toISOString(),
      end_date: endDate.toISOString(),
      charged_amount_ngn: tx.amount,
    };

    await supabase.from("subscriptions").upsert({ 
        user_id: tx.user_id, 
        ...subData 
    }, { onConflict: "user_id" });

    await supabase.from("profiles").update({ 
        plan_tier: planTier 
    }).eq("id", tx.user_id);
    
    logger.info(`[PaymentService] Subscription activated for ${tx.user_id}`);
  }

  async failTransaction(referenceOrId, reason) {
    const { data: returnedTx, error } = await supabase
      .from("transactions")
      .update({
        status: "FAILED",
        updated_at: new Date().toISOString(),
      })
      .or(`id.eq.${referenceOrId},reference_id.eq.${referenceOrId},provider_reference.eq.${referenceOrId}`)
      .select()
      .maybeSingle();

    // Sync with payments table
    await supabase
      .from("payments")
      .update({
        status: "failed",
        updated_at: new Date().toISOString(),
      })
      .or(`reference.eq.${referenceOrId}`);

    return returnedTx || { status: "FAILED" };
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

  /**
   * Notify User of Potential/Ambiguous Payment (Final Form Strategy)
   */
  async notifyPotentialPayment(senderFingerprint, queueType) {
    try {
      const email = senderFingerprint?.includes('@') ? senderFingerprint : null;
      if (!email) return;

      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("email", email)
        .maybeSingle();

      if (!profile) return;

      const { createNotification } = require("../notificationService");
      
      let title = "";
      let message = "";

      if (queueType === "ambiguous_match") {
         title = "Payment Review Initiated";
         message = "We detected a payment that may belong to you. Our system is reviewing it and will update you shortly.";
      } else if (queueType === "failed_parse") {
         title = "Payment Signal Received";
         message = "We received a payment signal but couldn’t fully verify the details. If you recently made a transfer, our team is reviewing it.";
      }

      if (title) {
        await createNotification({
          receiverId: profile.id,
          senderId: null,
          type: "system_update",
          title,
          message,
          link: "/dashboard/wallet",
        });
        logger.info(`[PaymentService] Potential payment notification sent for ${email} (${queueType})`);
      }
    } catch (err) {
      logger.error(`[PaymentService] notifyPotentialPayment failed: ${err.message}`);
    }
  }
}

module.exports = new PaymentService();
