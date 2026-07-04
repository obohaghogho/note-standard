const PaymentFactory = require("../services/payment/PaymentFactory");
const fxService = require("../services/fxService");
const supabase = require("../config/database");
const { v4: uuidv4 } = require("uuid");
const { getCallbackUrl } = require("../utils/url_utils");

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

    // Fincra is completely cut off as requested by User. Paystack is the exclusive card payment provider.
    let usedMethod = "paystack";

    // 2. Handle Currency Conversion
    let processedCurrency = upCurrency;
    let finalAmount = usdAmount;
    let exchangeRate = 1;

    if (usedMethod === "paystack") {
      const conversion = await fxService.convert(usdAmount, "USD", upCurrency, true);
      finalAmount = conversion.amount;
      processedCurrency = upCurrency;
      exchangeRate = conversion.rate;
    }

    // Ensure finalAmount is rounded to 2 decimal places to avoid API errors
    finalAmount = Math.round(finalAmount * 100) / 100;

    // 3. Provider Specific Logic (e.g. Paystack Plans)
    let providerPlan = null;
    if (usedMethod === 'paystack') {
      const planId = planType.toUpperCase() === "BUSINESS" 
        ? process.env.PAYSTACK_PLAN_BUSINESS 
        : process.env.PAYSTACK_PLAN_PRO;
      
      // Ensure the plan ID is valid and present
      if (planId) {
        providerPlan = planId;
      }
    }

    // 4. Initialize Payment through PaymentService to pre-register transaction
    const PaymentService = require("../services/payment/paymentService");
    const initResult = await PaymentService.initializePayment(
      userId,
      email,
      finalAmount,
      processedCurrency,
      {
        type: "subscription",
        plan: planType.toLowerCase(),
        display_label: `${planType} Subscription`,
        usdAmount,
        targetAmount: finalAmount,
        targetCurrency: processedCurrency, 
        displayCurrency: upCurrency, // What the user chose
        exchangeRate: exchangeRate,
      },
      {
        provider: usedMethod,
        plan: providerPlan,
        gatewayAmount: finalAmount,
        gatewayCurrency: processedCurrency,
        callbackUrl: getCallbackUrl("/dashboard/billing", {
          payment_callback: "true",
          method: usedMethod,
          currency: upCurrency,
        }, usedMethod)
      }
    );

    res.json({ 
      url: initResult.checkoutUrl || initResult.url,
      method: usedMethod,
      currency: upCurrency
    });
  } catch (error) {
    console.error("Error creating subscription checkout:", error);
    console.error(error.stack);
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

    // Lazy Downgrade: If subscription has expired, auto-downgrade
    if (data && data.status === "active" && data.end_date) {
      const endDate = new Date(data.end_date);
      if (endDate < new Date()) {
        console.log(`[Subscription] Lazy downgrade for user ${userId}: end_date ${data.end_date} has passed.`);
        await supabase
          .from("subscriptions")
          .update({ status: "expired", plan_tier: "free", plan_type: "FREE" })
          .eq("user_id", userId);
        await supabase
          .from("profiles")
          .update({ plan_tier: "free" })
          .eq("id", userId);

        // Return the downgraded state
        return res.json({ subscription: { ...data, status: "expired", plan_tier: "free", plan_type: "FREE" } });
      }
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
    const { reference } = req.body;
    const userId = req.user.id;

    console.log(`[Sync] Starting subscription sync for user ${userId}, reference: ${reference}`);

    if (!reference) {
      return res.status(400).json({ error: "Reference required" });
    }

    const PaymentService = require("../services/payment/paymentService");
    const result = await PaymentService.verifyPaymentStatus(reference);

    if (result && result.status === "COMPLETED") {
      res.json({ success: true });
    } else {
      res.json({ success: false, message: "Payment status not completed yet" });
    }
  } catch (error) {
    console.error("Error syncing subscription:", error);
    console.error(error.stack);
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
    const { amount } = req.body;

    if (!amount || amount < 5.00) {
      return res.status(400).json({ error: "Minimum top up is $5.00" });
    }

    const usdAmount = parseFloat(amount);
    const { amount: ngnAmount, rate } = await fxService.convert(
      usdAmount,
      "USD",
      "NGN",
      true,
    );
    const finalAmount = Math.round(ngnAmount * 100) / 100;
    const reference = require("uuid").v4();

    const callbackUrl = `${
      process.env.CLIENT_URL || "https://notestandard.com"
    }/dashboard/settings?wallet_topup=true&reference=${reference}`;

    const metadata = {
      userId,
      type: "wallet_topup",
      usdAmount,
      exchangeRate: rate,
    };

    const provider = PaymentFactory.getProviderByName("paystack");
    const result = await provider.initialize({
      email,
      amount: finalAmount,
      currency: "NGN",
      reference,
      callbackUrl,
      metadata,
    });

    res.json({ url: result.checkoutUrl || result.url });
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

    const provider = PaymentFactory.getProviderByName("paystack");
    const verification = await provider.verify(reference);

    if (
      verification.success &&
      verification.metadata?.type === "wallet_topup"
    ) {
      const usdAmount = verification.metadata.usdAmount;
      const userId = verification.metadata.userId;

      const { data: profile } = await supabase
        .from("profiles")
        .select("ad_wallet_balance")
        .eq("id", userId)
        .single();
        
      const currentBalance = Number(profile.ad_wallet_balance || 0);

      await supabase
        .from("profiles")
        .update({ ad_wallet_balance: currentBalance + Number(usdAmount) })
        .eq("id", userId);

      await supabase
        .from("wallet_transactions")
        .insert({
          user_id: userId,
          amount: usdAmount,
          type: "deposit",
          metadata: { reference }
        });

      res.json({ success: true, newBalance: currentBalance + Number(usdAmount) });
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
      .select("paystack_subscription_code, paystack_email_token, fincra_reference")
      .eq("user_id", userId)
      .single();

    if (!subscription) {
      return res.status(400).json({ error: "No active subscription found" });
    }

    // Try to cancel on Paystack if we have a subscription code
    if (subscription.paystack_subscription_code) {
      try {
        const axios = require("axios");
        await axios.post(
          "https://api.paystack.co/subscription/disable",
          {
            code: subscription.paystack_subscription_code,
            token: subscription.paystack_email_token,
          },
          {
            headers: {
              Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
              "Content-Type": "application/json",
            },
          }
        );
        console.log(`[Subscription] Paystack subscription disabled for user ${userId}`);
      } catch (paystackErr) {
        // Non-fatal: Paystack cancel may fail if it was a one-time payment, not a recurring sub
        console.warn(`[Subscription] Paystack disable failed (non-fatal):`, paystackErr.response?.data || paystackErr.message);
      }
    }

    // Always update local DB regardless of provider
    await supabase
      .from("subscriptions")
      .update({ status: "canceled", plan_tier: "free", plan_type: "FREE" })
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

exports.getBillingHistory = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data: payments, error: paymentsError } = await supabase
      .from("payments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (paymentsError) throw paymentsError;

    if (!payments || payments.length === 0) {
      return res.json({ history: [] });
    }

    const references = payments.map(p => p.reference).filter(Boolean);
    const transactionsMap = {};

    if (references.length > 0) {
      const { data: txs, error: txsError } = await supabase
        .from("transactions")
        .select("id, reference_id")
        .in("reference_id", references);

      if (!txsError && txs) {
        txs.forEach(tx => {
          transactionsMap[tx.reference_id] = tx.id;
        });
      }
    }

    const history = payments.map(p => ({
      id: p.id,
      reference: p.reference,
      provider: p.provider,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
      created_at: p.created_at,
      completed_at: p.completed_at,
      metadata: p.metadata,
      transactionId: transactionsMap[p.reference] || null
    }));

    res.json({ history });
  } catch (error) {
    console.error("Error fetching billing history:", error);
    res.status(500).json({ error: "Failed to fetch billing history" });
  }
};
