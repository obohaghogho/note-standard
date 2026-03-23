const PaymentFactory = require("../services/payment/PaymentFactory");
const fxService = require("../services/fxService");
const supabase = require("../config/database");
const { v4: uuidv4 } = require("uuid");

exports.createCheckoutSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { email } = req.user;
    const { 
      planType = "PRO", 
      paymentMethod = null, // Optional, can be null for auto-selection
      currency = "NGN" 
    } = req.body;

    const upCurrency = currency.toUpperCase();
    let usdAmount = planType.toUpperCase() === "BUSINESS" ? 29.99 : 9.99;

    // 1. Fetch User Profile for Name
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .single();

    const customerName = profile?.full_name || email.split("@")[0] || "Standard User";
    const reference = uuidv4();

    // Dynamically choose Fincra natively in PRODUCTION for USD/EUR/GBP
    const isProduction = process.env.NODE_ENV === "production";
    const useFincra = isProduction && upCurrency !== "NGN";

    // 2. Handle Currency Conversion
    let processedCurrency = useFincra ? upCurrency : "NGN"; // Force Paystack NGN locally, Fincra native in Prod
    let finalAmount = usdAmount; // Will hold the target provider's amount
    let exchangeRate = 1;

    if (!useFincra) {
      const conversion = await fxService.convert(usdAmount, "USD", "NGN", true);
      finalAmount = conversion.amount;
      exchangeRate = conversion.rate;
    } else if (upCurrency !== "USD") {
      // For Fincra, if not USD, convert from USD to Target (e.g. EUR)
      const conversion = await fxService.convert(usdAmount, "USD", upCurrency, true);
      finalAmount = conversion.amount;
      exchangeRate = conversion.rate;
    }

    // 3. Metadata for the transaction
    const metadata = {
      userId,
      email,
      customerName,
      type: "subscription",
      plan: planType.toLowerCase(),
      usdAmount,
      targetAmount: finalAmount,
      targetCurrency: processedCurrency, 
      displayCurrency: upCurrency, // What the user chose
      exchangeRate: exchangeRate,
      reference: reference, // Store our internal ref in metadata too
    };

    const usedMethod = useFincra ? "fincra" : "paystack";
    const provider = PaymentFactory.getProviderByName(usedMethod);

    let callbackUrl = `${
      process.env.CLIENT_URL || "https://notestandard.com"
    }/dashboard/billing?payment_callback=true&method=${usedMethod}&currency=${upCurrency}&reference=${reference}`;

    // Fincra strictly rejects "localhost" in redirect URLs.
    if (callbackUrl.includes("http://localhost")) {
      callbackUrl = callbackUrl.replace("http://localhost", "http://127.0.0.1");
    }

    // 5. Provider Specific Logic (e.g. Paystack Plans)
    let providerPlan = null;
    if (usedMethod === 'paystack') {
      const planId = planType.toUpperCase() === "BUSINESS" 
        ? process.env.PAYSTACK_PLAN_BUSINESS 
        : process.env.PAYSTACK_PLAN_PRO;
      
      // Only use the plan if it's not a placeholder
      if (planId && !planId.includes("placeholder")) {
        providerPlan = planId;
      }
    }

    const checkoutData = {
      email,
      name: customerName,
      amount: finalAmount,
      currency: processedCurrency,
      reference: reference,
      callbackUrl,
      metadata,
      plan: providerPlan
    };

    const result = await provider.initialize(checkoutData);

    res.json({ 
      url: result.checkoutUrl || result.url,
      method: usedMethod,
      currency: upCurrency
    });
  } catch (error) {
    console.error("Error creating subscription checkout:", error);
    console.error(error.stack);
    require("fs").writeFileSync("err_stack.txt", error.stack);
    res.status(500).json({ error: "Failed to create checkout session" });
  }
};

exports.getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    res.json({ subscription: data || null });
  } catch (error) {
    console.error("Error fetching subscription status:", error);
    res.status(500).json({ error: "Failed to fetch subscription status" });
  }
};

// Simple success handler called by frontend after redirect
// In production, rely on Webhooks! This is a fallback/visual sync.
exports.syncSubscription = async (req, res) => {
  try {
    const { reference, method = "paystack" } = req.body;
    const userId = req.user.id;

    console.log(`[Sync] Starting sync for user ${userId}, reference: ${reference}, method: ${method}`);

    if (!reference) {
      return res.status(400).json({ error: "Reference required" });
    }

    const provider = PaymentFactory.getProviderByName(method);
    const verification = await provider.verify(reference);
    
    console.log(`[Sync] Transaction verified: success=${verification.success}`);

    if (verification.success) {
      // Extract metadata from provider response
      let metadata = verification.raw?.metadata || verification.metadata;
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch (e) {
          metadata = {};
        }
      }
      
      const { exchangeRate, plan } = metadata || {};
      const chargedAmountNgn = verification.amount; // verification.amount is already normalized in providers

      console.log(`[Sync] Plan: ${plan}, Exchange Rate: ${exchangeRate}, Amount: ${chargedAmountNgn}`);

      // Check if subscription exists
      const { data: existing, error: fetchError } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      const subscriptionData = {
        plan_tier: plan || "pro",
        plan_type: plan ? plan.toUpperCase() : "PRO",
        status: "active",
        charged_amount_ngn: chargedAmountNgn,
        exchange_rate: exchangeRate || 0,
        // Provider specific fields
        ...(method === 'paystack' ? {
          paystack_customer_code: verification.raw?.customer?.customer_code,
          paystack_subscription_code: verification.raw?.subscription_code,
          paystack_transaction_reference: reference
        } : {
          fincra_reference: reference
        })
      };

      let opError;
      if (existing) {
        const { error: updateError } = await supabase
          .from("subscriptions")
          .update(subscriptionData)
          .eq("user_id", userId);
        opError = updateError;
      } else {
        const { error: insertError } = await supabase
          .from("subscriptions")
          .insert({ user_id: userId, ...subscriptionData });
        opError = insertError;
      }

      if (opError) throw opError;

      // SYNC TO PROFILES TABLE
      await supabase
        .from("profiles")
        .update({ plan_tier: plan || "pro" })
        .eq("id", userId);

      res.json({ success: true });
    } else {
      res.json({ success: false, message: "Payment not successful" });
    }
  } catch (error) {
    console.error("Error syncing subscription:", error);
    console.error(error.stack);
    require("fs").writeFileSync("err_sync_stack.txt", error.stack || error.message);
    res.status(500).json({ error: "Sync failed", details: error.message });
  }
};

exports.getExchangeRate = async (req, res) => {
  try {
    const rate = await fxService.getRate("USD", "NGN", true); // value of 1 USD in NGN
    res.json({ rate });
  } catch (error) {
    console.error("Error getting exchange rate:", error);
    res.status(500).json({ error: "Failed to get rate" });
  }
};

exports.createAdCheckoutSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { email } = req.user;
    const { adId } = req.body;

    if (!adId) {
      return res.status(400).json({ error: "Ad ID is required" });
    }

    const usdAmount = 5.00;
    const { amount: ngnAmount, rate } = await fxService.convert(
      usdAmount,
      "USD",
      "NGN",
      true,
    );
    const amountInKobo = Math.round(ngnAmount * 100);

    const callbackUrl = `${
      process.env.CLIENT_URL || "https://notestandard.com"
    }/dashboard/settings?ad_success=true&adId=${adId}`;

    const metadata = {
      userId,
      adId,
      type: "ad_payment",
      usdAmount,
      exchangeRate: rate,
    };

    const transaction = await paystackService.initializeTransaction(
      email,
      amountInKobo,
      callbackUrl,
      metadata,
      null, // reference
    );

    res.json({ url: transaction.authorization_url });
  } catch (error) {
    console.error("Error creating ad checkout session:", error);
    res.status(500).json({ error: "Failed to create ad checkout session" });
  }
};

exports.syncAdPayment = async (req, res) => {
  try {
    const { reference } = req.body;

    if (!reference) {
      return res.status(400).json({ error: "Reference required" });
    }

    const transaction = await paystackService.verifyTransaction(reference);

    if (
      transaction.status === "success" &&
      transaction.metadata?.type === "ad_payment"
    ) {
      const adId = transaction.metadata.adId;

      const { error } = await supabase
        .from("ads")
        .update({ status: "pending" }) // Move from pending_payment to pending (review)
        .eq("id", adId);

      if (error) throw error;

      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  } catch (error) {
    console.error("Error syncing ad payment:", error);
    res.status(500).json({ error: "Sync failed" });
  }
};

// Portal session is not supported by Paystack in the same way.
// We should provide a "Cancel Subscription" endpoint instead.
exports.cancelSubscription = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("paystack_subscription_code, paystack_email_token") // identifying tokens
      .eq("user_id", userId)
      .single();

    if (!subscription || !subscription.paystack_subscription_code) {
      return res.status(400).json({ error: "No active subscription found" });
    }

    // Call Paystack disable subscription
    await paystackService.disableSubscription(
      subscription.paystack_subscription_code,
      subscription.paystack_email_token,
    );

    // Update DB
    await supabase
      .from("subscriptions")
      .update({ status: "canceled" })
      .eq("user_id", userId);

    // SYNC TO PROFILES TABLE
    await supabase
      .from("profiles")
      .update({ plan_tier: "free" })
      .eq("id", userId);

    res.json({ success: true });
  } catch (error) {
    console.error("Error canceling subscription:", error);
    res.status(500).json({ error: "Failed to cancel subscription" });
  }
};
