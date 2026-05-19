/**
 * PaymentIntentService.js
 * =======================
 * The enterprise gateway for initializing payments.
 * This completely abstracts the actual provider and ensures
 * strict currency isolation, amount normalization, and ledger immutability.
 */

const { v4: uuidv4 } = require("uuid");
const supabase = require("../../config/database");
const logger = require("../../utils/logger");
const PaymentFactory = require("./PaymentFactory");
const { getProviderCapabilities } = require("../../config/providerCapabilities");
const { getMetadata } = require("../../config/currencyMetadata");

class PaymentIntentService {
  /**
   * Asserts that a currency can be processed natively by the target provider.
   */
  static assertCurrencyIntegrity(providerName, currency) {
    const caps = getProviderCapabilities(providerName);
    if (!caps.supportedCurrencies.includes(currency)) {
      throw new Error(`[PaymentIntent] CurrencyIntegrityViolation: ${providerName} does not support ${currency}`);
    }
  }

  /**
   * The single entry point for creating a payment.
   * Replaces direct controller calls to PaymentFactory.
   */
  static async createPaymentIntent(params) {
    const {
      userId,
      email,
      amount,
      currency,
      method = "card",
      isCrypto = false,
      metadata = {},
    } = params;

    const upCurrency = String(currency).toUpperCase();
    const idempotencyKey = metadata.idempotencyKey || `pi_${uuidv4()}`;

    // 1. Determine Provider via Factory
    const provider = PaymentFactory.getProvider(upCurrency, metadata.region || "NG", isCrypto, method);
    const providerName = provider.constructor.name.replace("Provider", "").toLowerCase();

    // 2. Strict Currency Integrity Guard
    this.assertCurrencyIntegrity(providerName, upCurrency);

    // 3. Prevent duplicate intents
    const { data: existingTx } = await supabase
      .from("transactions")
      .select("*")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (existingTx) {
      logger.info(`[PaymentIntent] Resuming existing intent: ${existingTx.reference_id}`);
      return { reference: existingTx.reference_id, status: existingTx.status, provider: existingTx.provider };
    }

    // 4. Resolve Wallet
    const { data: wallet } = await supabase
      .from("wallets_store")
      .select("id")
      .eq("user_id", userId)
      .eq("currency", upCurrency)
      .maybeSingle();

    if (!wallet) {
      throw new Error(`[PaymentIntent] No active wallet found for currency: ${upCurrency}`);
    }

    // 5. Create Immutable Ledger Entry (State: INITIALIZED)
    const reference = `tx_${uuidv4().replace(/-/g, "")}`;
    const txPayload = {
      user_id: userId,
      wallet_id: wallet.id,
      amount: amount, 
      currency: upCurrency, // Display currency
      processing_amount: amount, // The amount that WILL be sent to the provider
      processing_currency: upCurrency, // The currency that WILL be sent to the provider
      status: "INITIALIZED",
      reference_id: reference,
      idempotency_key: idempotencyKey,
      provider: providerName,
      type: metadata.type || "DEPOSIT",
      display_label: metadata.display_label || `Deposit ${upCurrency}`,
      metadata: { ...metadata, intent_created_at: new Date().toISOString() },
    };

    const { data: tx, error: txError } = await supabase
      .from("transactions")
      .insert(txPayload)
      .select()
      .single();

    if (txError) {
      logger.error(`[PaymentIntent] Failed to create immutable record: ${txError.message}`);
      throw new Error("Failed to initialize payment ledger.");
    }

    // 6. Delegate to the actual provider adapter
    // The provider MUST trust the processing_amount and processing_currency.
    logger.info(`[PaymentIntent] Initializing provider adapter for ${reference} (${providerName})`);
    
    let initResult;
    try {
      initResult = await provider.initialize({
        email,
        amount: tx.processing_amount,
        currency: tx.processing_currency,
        reference,
        callbackUrl: metadata.callbackUrl || `${process.env.CLIENT_URL || 'https://notestandard.com'}/activity/success`,
        metadata: {
          ...metadata,
          transactionId: tx.id,
        }
      });

      // Advance State Machine
      await supabase.from("transactions").update({
        status: "PENDING",
        provider_reference: initResult.providerReference || reference
      }).eq("id", tx.id);

    } catch (err) {
      // Advance State Machine to FAILED
      await supabase.from("transactions").update({
        status: "FAILED",
        metadata: { ...tx.metadata, fail_reason: err.message }
      }).eq("id", tx.id);
      
      throw new Error(`[PaymentIntent] Provider initialization failed: ${err.message}`);
    }

    return {
      reference,
      provider: providerName,
      providerReference: initResult.providerReference,
      checkoutUrl: initResult.checkoutUrl || initResult.link || initResult.paymentUrl,
      payAddress: initResult.payAddress,
      instructions: initResult.instructions,
    };
  }
}

module.exports = PaymentIntentService;
