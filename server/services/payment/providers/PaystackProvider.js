const axios = require("axios");
const crypto = require("crypto");
const math = require("../../../utils/mathUtils");
const BaseProvider = require("./BaseProvider");
const { isPaystackNative } = require("../../../config/currencyConfig");

class PaystackProvider extends BaseProvider {
  constructor() {
    super();
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.baseUrl = "https://api.paystack.co";
    this.isTestKey = this.secretKey && this.secretKey.includes("_test_");
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  async initialize(data) {
    let { email, amount, currency, reference, callbackUrl, metadata } = data;

    // ── Currency Normalization (DFOS v6.4) ───────────────────────────────────
    // IMPORTANT: Currency pre-conversion is the EXCLUSIVE responsibility of
    // depositService.createCardDeposit(), which populates gatewayOptions.gatewayCurrency
    // and gatewayOptions.gatewayAmount using currencyConfig.
    // PaymentService.initializePayment() then passes those through to here via
    // the `amount` and `currency` parameters (options.gatewayAmount || amount).
    //
    // This provider must NEVER perform its own FX conversion — doing so would
    // cause a double FX hit and an unauditable rate discrepancy.
    //
    // If this provider receives a non-native currency (not NGN or USD), it means
    // the caller failed to pre-convert. We log a critical warning and attempt
    // a best-effort passthrough, but this should NEVER happen in production.
    if (!isPaystackNative(currency)) {
      console.error(
        `[PaystackProvider] CRITICAL: Received non-native currency ${currency} without pre-conversion. ` +
        `This is a caller contract violation. depositService should have pre-converted via gatewayOptions. ` +
        `Proceeding with raw currency — payment may be rejected by Paystack.`
      );
    }

    // ── Sandbox Guard (TEST KEYS ONLY) ───────────────────────────────────────
    // Paystack sandbox frequently only processes NGN. When running with a test
    // key, auto-convert USD→NGN so development environments stay stable.
    // This block is strictly gated on the isTestKey flag set in constructor.
    // It MUST NEVER fire in production (sk_live keys).
    if (this.isTestKey && currency === "USD") {
      const fxService = require("../../fxService");
      try {
        const rate = await fxService.getRate("USD", "NGN");
        amount = amount * rate;
        currency = "NGN";
        metadata = { ...metadata, sandbox_ngn_converted: true, sandbox_original_currency: "USD" };
        console.warn(`[PaystackProvider] SANDBOX MODE: Converted USD→NGN for test key compatibility. Rate: ${rate}`);
      } catch (fxErr) {
        console.warn(`[PaystackProvider] Sandbox NGN fallback conversion failed: ${fxErr.message}. Proceeding as USD.`);
      }
    } else if (!this.isTestKey && !isPaystackNative(currency)) {
      // Production safety: If this fires, a pre-conversion bug slipped through.
      // After DFOS v6.4, all non-NGN currencies (including USD) are pre-converted
      // to NGN by depositService before reaching this provider.
      // We should never reach here in a correctly configured system.
      console.error(`[PaystackProvider] PRODUCTION WARNING: Non-native currency ${currency} passed to Paystack on live key. Expected pre-conversion from depositService.`);
    }

    // Paystack uses smallest unit (kobo for NGN, cent for USD)
    const amountInSmallestUnit = Math.round(amount * 100);

    try {
      const response = await this.client.post("/transaction/initialize", {
        email,
        amount: amountInSmallestUnit,
        currency,
        reference,
        callback_url: callbackUrl,
        plan: data.plan,
        metadata: {
          ...metadata,
          category: "digital_assets",
          product_type: "digital_asset",
          custom_fields: [
            {
              display_name: "Description",
              variable_name: "description",
              value: "Digital Assets Purchase",
            },
            {
              display_name: "Reference",
              variable_name: "reference",
              value: reference,
            },
          ],
        },
      });

      return {
        checkoutUrl: response.data.data.authorization_url,
        providerReference: response.data.data.reference,
        accessCode: response.data.data.access_code,
      };
    } catch (error) {
      console.error(
        "Paystack Init Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message || "Paystack initialization failed",
      );
    }
  }

  /**
   * Request a dedicated virtual account for NGN bank transfers
   */
  async getDedicatedAccount(email, firstName, lastName, phone) {
    try {
      // 1. Ensure user is a Paystack customer
      let customerCode;
      try {
        const customerResponse = await this.client.post("/customer", {
          email,
          first_name: firstName,
          last_name: lastName,
          phone: phone || undefined,
        });
        customerCode = customerResponse.data.data.customer_code;
      } catch (custError) {
        // Handle "Customer already exists" or other registration errors
        if (custError.response?.data?.message?.includes("already exists") || custError.response?.status === 400) {
          // Try to fetch existing customer
          const fetchResponse = await this.client.get(`/customer/${email}`);
          customerCode = fetchResponse.data.data.customer_code;
        } else {
          console.error("[Paystack] Customer Creation Failed:", custError.response?.data || custError.message);
          throw custError;
        }
      }

      if (!customerCode) throw new Error("Could not resolve Paystack customer code");

      // 2. Request dedicated virtual account
      // Note: "preferred_bank" is optional. We try titan-paystack first, 
      // but we'll retry without it if it fails with a bank-specific error.
      let response;
      try {
        response = await this.client.post("/dedicated_account", {
          customer: customerCode,
          preferred_bank: "titan-paystack", 
        });
      } catch (daError) {
        const msg = daError.response?.data?.message || "";
        const isBankError = msg.includes("bank") || msg.includes("provider") || msg.includes("not available");
        
        if (isBankError) {
            console.warn(`[Paystack] titan-paystack failed (${msg}), retrying without preferred_bank...`);
            response = await this.client.post("/dedicated_account", {
                customer: customerCode
            });
        } else {
            throw daError;
        }
      }

      const entry = response.data.data;
      
      // Paystack might return a success message but still be "processing" 
      // if it's the first time. We should handle that.
      if (!entry || !entry.account_number) {
          // If it's pending, we might need to fetch it again later
          // For now, let's try to fetch if the POST didn't return the full object
          const fetchAcc = await this.client.get(`/dedicated_account?customer=${customerCode}`);
          if (fetchAcc.data.data && fetchAcc.data.data.length > 0) {
              const activeAcc = fetchAcc.data.data.find(a => a.active && a.currency === "NGN");
              if (activeAcc) {
                  return {
                    id: activeAcc.id,
                    bankName: activeAcc.bank.name,
                    accountNumber: activeAcc.account_number,
                    accountName: activeAcc.account_name,
                    currency: activeAcc.currency,
                    provider: "paystack",
                    customerCode: customerCode,
                    assignmentReference: activeAcc.assignment?.reference
                  };
              }
          }
          throw new Error("Virtual account is still being provisioned by Paystack. Please try again in 60 seconds.");
      }

      return {
        id: entry.id,
        bankName: entry.bank.name,
        accountNumber: entry.account_number,
        accountName: entry.account_name,
        currency: entry.currency,
        provider: "paystack",
        customerCode: customerCode,
        assignmentReference: entry.assignment?.reference
      };
    } catch (error) {
      const paystackError = error.response?.data || {};
      console.error(
        "Paystack Dedicated Account Error:",
        paystackError,
      );
      
      // Specific error for bank downtime
      if (paystackError.message?.includes("bank") && paystackError.message?.includes("downtime")) {
          throw new Error("Paystack's partner banks are currently experiencing downtime. Please try again later or use Card payment.");
      }

      // If it still says not available, it might be the business configuration
      if (paystackError.message?.includes("not available for your business")) {
          throw new Error("Dedicated NUBAN is not available for your Paystack business. Please ensure your account is 'Live' and you have enabled DVAs in your Paystack Dashboard Settings.");
      }

      throw new Error(
        paystackError.message || error.message || "Failed to generate virtual account"
      );
    }
  }

  async verify(reference) {
    try {
      const response = await this.client.get(
        `/transaction/verify/${reference}`,
      );
      const data = response.data.data;
      const { status, amount, currency, reference: ref, metadata } = data;

      return {
        success: status === "success",
        status: status, // success, abandoned, failed
        amount: math.divide(amount, 100),
        currency: currency,
        reference: ref,
        provider: "paystack",
        metadata: metadata,
        raw: data,
      };
    } catch (error) {
      console.error(
        "Paystack Verify Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message || "Paystack verification failed",
      );
    }
  }

  verifyWebhookSignature(headers, body, rawBody = null) {
    const signature = headers["x-paystack-signature"];
    if (!signature || !this.secretKey) return false;

    // Use rawBody (Buffer) if available, otherwise fallback to stringified body
    const data = rawBody || JSON.stringify(body);

    const hash = crypto
      .createHmac("sha512", this.secretKey)
      .update(data)
      .digest("hex");

    return hash === signature;
  }

  parseWebhookEvent(payload) {
    const event = payload.event;
    const data = payload.data;

    let status = "pending";
    if (event === "charge.success") status = "success";
    else if (event === "charge.failed") status = "failed";
    else if (event === "subscription.disable" || event === "subscription.not_renew") status = "cancelled";

    let type = (data.metadata?.type === "ad" || data.metadata?.type === "ads")
      ? "AD_PAYMENT"
      : (data.metadata?.type === "subscription"
        ? "SUBSCRIPTION_PAYMENT"
        : (event?.startsWith("subscription.") 
          ? "SUBSCRIPTION_CANCELLATION"
          : "DEPOSIT"));

    // --- DVA Support (DFOS v6.5) ---
    // If it's a dedicated account payment, the metadata might be empty.
    // We can identify it by data.dedicated_account or data.customer.customer_code
    let userId = data.metadata?.userId || data.metadata?.user_id;
    
    return {
      type: type,
      display_label: data.metadata?.display_label || "Digital Assets Purchase",
      reference: data.reference,
      status: status,
      amount: math.divide(data.amount, 100),
      currency: data.currency,
      userId: userId,
      customerCode: data.customer?.customer_code,
      accountNumber: data.dedicated_account?.account_number,
      raw: payload,
    };
  }
}

module.exports = PaystackProvider;
