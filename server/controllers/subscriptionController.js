const paystackService = require("../services/paystackService");
const supabase = require("../config/database");
const fxService = require("../services/fxService");

exports.createCheckoutSession = async (req, res) => {
  try {
    const userId = req.user.id;
    const { email } = req.user;
    const { planType = "PRO" } = req.body;

    let usdAmount = 9.99;
    let paystackPlan = process.env.PAYSTACK_PLAN_PRO;

    if (planType.toUpperCase() === "BUSINESS") {
      usdAmount = 29.99;
      paystackPlan = process.env.PAYSTACK_PLAN_BUSINESS;
    }

    const { amount: ngnAmount, rate } = await fxService.convert(
      usdAmount,
      "USD",
      "NGN",
      true,
    );
    const amountInKobo = Math.round(ngnAmount * 100);

    // Metadata for the transaction
    const metadata = {
      userId,
      type: "subscription_upgrade",
      plan: planType.toLowerCase(),
      usdAmount,
      exchangeRate: rate,
    };

    const callbackUrl = `${
      process.env.CLIENT_URL || "https://notestandard.com"
    }/dashboard/billing?payment_callback=true`;

    const transaction = await paystackService.initializeTransaction(
      email,
      amountInKobo,
      callbackUrl,
      metadata,
      null, // reference
      paystackPlan,
    );

    res.json({ url: transaction.authorization_url });
  } catch (error) {
    console.error("Error creating Paystack checkout:", error);
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
    const { reference } = req.body;
    const userId = req.user.id;

    console.log(`[Sync] Starting sync for user ${userId}, reference: ${reference}`);

    if (!reference) {
      return res.status(400).json({ error: "Reference required" });
    }

    const transaction = await paystackService.verifyTransaction(reference);
    console.log(`[Sync] Transaction verified: status=${transaction.status}`);

    if (transaction.status === "success") {
      // Paystack metadata might be a string if not automatically parsed by axios
      let metadata = transaction.metadata;
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch (e) {
          console.error("[Sync] Failed to parse metadata string:", e);
          metadata = {};
        }
      }
      
      const { exchangeRate, plan } = metadata || {};
      const chargedAmountNgn = transaction.amount / 100; // Convert kobo to NGN

      console.log(`[Sync] Plan: ${plan}, Exchange Rate: ${exchangeRate}, Amount NGN: ${chargedAmountNgn}`);

      // 3. Upsert subscription manually (Check then Update/Insert)

      // Check if subscription exists
      const { data: existing, error: fetchError } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .maybeSingle();

      if (fetchError) {
        console.error("[Sync] Error fetching existing subscription:", fetchError);
        throw fetchError;
      }

      const subscriptionData = {
        paystack_customer_code: transaction.customer.customer_code,
        paystack_subscription_code: transaction.plan
          ? transaction.subscription_code
          : null,
        paystack_transaction_reference: reference,
        plan_tier: plan || "pro",
        plan_type: plan ? plan.toUpperCase() : "PRO",
        status: "active",
        charged_amount_ngn: chargedAmountNgn,
        exchange_rate: exchangeRate || 0, // Fallback to 0 if missing
      };

      console.log("[Sync] Upserting subscription data:", JSON.stringify(subscriptionData, null, 2));

      let opError;
      if (existing) {
        // Update existing
        console.log(`[Sync] Updating existing subscription ${existing.id}`);
        const { error: updateError } = await supabase
          .from("subscriptions")
          .update(subscriptionData)
          .eq("user_id", userId);
        opError = updateError;
      } else {
        // Insert new
        console.log("[Sync] Creating new subscription");
        const { error: insertError } = await supabase
          .from("subscriptions")
          .insert({
            user_id: userId,
            ...subscriptionData,
          });
        opError = insertError;
      }

      if (opError) {
        console.error("[Sync] Database operation error:", opError);
        throw opError;
      }

      console.log("[Sync] Sync successful");

      // SYNC TO PROFILES TABLE
      try {
        await supabase
          .from("profiles")
          .update({ plan_tier: plan || "pro" })
          .eq("id", userId);
        console.log(`[Sync] Updated profiles.plan_tier to ${plan || "pro"} for user ${userId}`);
      } catch (profErr) {
        console.error("[Sync] Failed to update profiles.plan_tier:", profErr);
      }

      res.json({ success: true });
    } else {
      console.log(`[Sync] Transaction not successful. Status: ${transaction.status}`);
      res.json({ success: false, message: "Payment not successful" });
    }
  } catch (error) {
    console.error("Error syncing subscription:", error);
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
