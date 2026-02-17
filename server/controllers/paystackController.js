const crypto = require("crypto");
const axios = require("axios");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const supabase = require(path.join(__dirname, "..", "config", "supabase"));

/**
 * Handle Paystack Webhook
 * Production-ready implementation with logging and verification.
 */
exports.handleWebhook = async (req, res) => {
  const timestamp = new Date().toISOString();
  console.log(`\n[${timestamp}] 🔔 PAYSTACK WEBHOOK RECEIVED`);

  try {
    const secret = process.env.PAYSTACK_SECRET_KEY;
    if (!secret) {
      console.error("[Paystack] ❌ ERROR: Missing PAYSTACK_SECRET_KEY in env");
      return res.status(500).json({
        status: false,
        message: "Server misconfiguration",
      });
    }

    // 1. SIGNATURE VERIFICATION
    const signature = req.headers["x-paystack-signature"];
    if (!signature) {
      console.warn("[Paystack] ⚠️ WARNING: No signature provided");
      return res.status(401).json({ status: false, message: "Unauthorized" });
    }

    const hash = crypto.createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("hex");

    if (hash !== signature) {
      console.error("[Paystack] ❌ ERROR: Invalid signature match");
      return res.status(401).json({
        status: false,
        message: "Invalid signature",
      });
    }

    const event = req.body;
    console.log(
      `[Paystack] Status: 🛡️ Signature Verified | Event: ${event.event}`,
    );

    // 2. FILTER EVENTS
    if (event.event !== "charge.success") {
      console.log(`[Paystack] Info: Event "${event.event}" ignored.`);
      return res.status(200).json({ status: true, message: "Event ignored" });
    }

    const { reference, amount, metadata, currency } = event.data;
    const type = metadata?.type || "unknown";
    const userId = metadata?.userId;

    console.log(
      `[Paystack] Data: Ref: ${reference} | Amount: ${currency}${
        amount / 100
      } | User: ${userId} | Type: ${type}`,
    );

    // 3. API VERIFICATION (Final security check with Paystack server)
    if (!reference.startsWith("TEST_")) {
      try {
        const verification = await axios.get(
          `https://api.paystack.co/transaction/verify/${reference}`,
          {
            headers: { Authorization: `Bearer ${secret}` },
          },
        );

        if (verification.data.data.status !== "success") {
          console.error(`[Paystack] ❌ Verification failed for ${reference}`);
          return res.status(200).json({
            status: true,
            message: "Paystack verification failed",
          });
        }
      } catch (vErr) {
        console.error("[Paystack] ❌ API Verification Error:", vErr.message);
        return res.status(500).json({
          status: false,
          message: "Could not verify with Paystack",
        });
      }
    }

    // 4. IDEMPOTENCY CHECK
    const { data: existingTx } = await supabase
      .from("transactions")
      .select("id")
      .eq("external_hash", reference)
      .maybeSingle();

    if (existingTx) {
      console.log(`[Paystack] ⏭️ Skipping duplicate transaction: ${reference}`);
      return res.status(200).json({
        status: true,
        message: "Duplicate transaction",
      });
    }

    // 5. PROCESS BUSINESS LOGIC
    const mainAmount = amount / 100;

    if (type === "wallet") {
      await handleWalletFunding(
        userId,
        mainAmount,
        currency,
        reference,
        metadata,
      );
    } else if (type === "ad") {
      const adId = metadata?.adId;
      await handleAdPayment(
        userId,
        adId,
        mainAmount,
        currency,
        reference,
        metadata,
      );
    } else {
      console.warn(`[Paystack] ⚠️ Unsupported type: ${type}`);
    }

    console.log(
      `[Paystack] ✅ SUCCESS: Webhook processing completed for ${reference}\n`,
    );
    return res.status(200).json({ status: true, message: "Webhook processed" });
  } catch (error) {
    console.error("[Paystack] 💀 CRITICAL ERROR:", error.message);
    return res.status(500).json({
      status: false,
      message: "Internal server error",
    });
  }
};

/**
 * Atomic Wallet Update
 */
async function handleWalletFunding(
  userId,
  amount,
  currency,
  reference,
  metadata,
) {
  if (!userId) throw new Error("Missing userId for wallet funding");

  console.log(`[Paystack] 💰 Processing Wallet Funding for User: ${userId}`);

  // Fetch or Init Wallet
  let { data: wallet } = await supabase
    .from("wallets")
    .select("*")
    .eq("user_id", userId)
    .eq("currency", currency)
    .maybeSingle();

  if (!wallet) {
    const { data: newWallet, error: createError } = await supabase
      .from("wallets")
      .insert({ user_id: userId, currency, balance: 0, available_balance: 0 })
      .select().single();
    if (createError) throw createError;
    wallet = newWallet;
  }

  // Update Balance
  const { error: updateError } = await supabase
    .from("wallets")
    .update({
      balance: wallet.balance + amount,
      available_balance: wallet.available_balance + amount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", wallet.id);

  if (updateError) throw updateError;

  // Record Transaction
  await supabase.from("transactions").insert({
    wallet_id: wallet.id,
    type: "Digital Assets Purchase",
    display_label: "Digital Assets Purchase",
    amount: amount,
    currency: currency,
    status: "COMPLETED",
    reference_id: uuidv4(),
    external_hash: reference,
    metadata: { ...metadata, provider: "paystack" },
  });

  // Notify user
  try {
    const { createNotification } = require("../services/notificationService");
    // We need io from the app, but this function is helper.
    // We can pass it or fetch it if we have req. For now, we'll try to find it globally if possible,
    // but better to just do DB notification and let client poll or use supabase realtime.
    // Actually, the app usually sets io on itself. We don't have direct access here easily without passing it.
    // I'll skip IO for now and rely on DB notification which will show on next refresh/poll.
    await createNotification({
      receiverId: userId,
      type: "wallet_deposit",
      title: "Deposit Successful",
      message: `Your wallet has been credited with ${currency} ${amount}.`,
      link: "/dashboard/wallet",
    });
  } catch (nErr) {
    console.error("Failed to send deposit notification:", nErr);
  }
}

/**
 * Ad Payment Update
 */
async function handleAdPayment(
  userId,
  adId,
  amount,
  currency,
  reference,
  metadata,
) {
  if (!adId) throw new Error("Missing adId for payment processing");

  console.log(`[Paystack] 📢 Processing Ad Payment for Ad: ${adId}`);

  // Update Ad Status
  const { error: adError } = await supabase
    .from("ads")
    .update({
      payment_status: "paid",
      status: "approved",
      updated_at: new Date().toISOString(),
    })
    .eq("id", adId)
    .eq("user_id", userId);

  if (adError) throw adError;

  // Record against a wallet for consistency
  let { data: wallet } = await supabase
    .from("wallets")
    .select("id")
    .eq("user_id", userId)
    .eq("currency", currency)
    .maybeSingle();

  if (wallet) {
    await supabase.from("transactions").insert({
      wallet_id: wallet.id,
      type: "Digital Assets Purchase",
      display_label: "Digital Assets Purchase",
      amount: amount,
      currency: currency,
      status: "COMPLETED",
      reference_id: uuidv4(),
      external_hash: reference,
      metadata: { ...metadata, provider: "paystack", adId },
    });

    // Notify user
    try {
      const { createNotification } = require("../services/notificationService");
      await createNotification({
        receiverId: userId,
        type: "ad_payment",
        title: "Ad Payment Received",
        message:
          `Payment for your ad has been confirmed. It is now awaiting final moderation.`,
        link: "/dashboard/wallet",
      });
    } catch (nErr) {
      console.error("Failed to send ad payment notification:", nErr);
    }
  }
}
