const axios = require("axios");
const crypto = require("crypto");
const math = require("../../../utils/mathUtils");
const BaseProvider = require("./BaseProvider");

class PaystackProvider extends BaseProvider {
  constructor() {
    super();
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.baseUrl = "https://api.paystack.co";
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

    // Sandbox & Multi-Currency Auto-Conversion
    // Paystack (especially Nigerian accounts) primarily supports NGN. 
    // USD, EUR, GBP, and JPY are often unsupported unless explicitly enabled.
    const crossBorderCurrencies = ["USD", "EUR", "GBP", "JPY"];
    
    if (crossBorderCurrencies.includes(currency)) {
      const fxService = require("../../fxService");
      try {
        // We only auto-convert to NGN in TEST MODE to ensure the sandbox checkout doesn't fail.
        // In LIVE MODE, we let the original currency pass through so the user sees EUR/GBP/etc.
        const isTestKey = this.secretKey && this.secretKey.includes("test");
        const shouldConvert = isTestKey && ["EUR", "GBP", "JPY"].includes(currency);
        
        if (shouldConvert) {
          const rate = await fxService.getRate(currency, "NGN");
          amount = amount * rate;
          const originalCurrency = currency;
          currency = "NGN";
          metadata = { ...metadata, auto_converted_from: originalCurrency, conversion_rate: rate };
          console.info(`[Paystack] Sandbox Auto-converted ${amount} ${originalCurrency} to NGN for checkout testing.`);
        }
      } catch (e) {
        console.warn(`[Paystack] FX conversion failed for ${currency}, attempting raw request`, e.message);
      }
    }

    // Paystack uses smallest unit (kobo for NGN)
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
          phone,
        });
        customerCode = customerResponse.data.data.customer_code;
      } catch (custError) {
        // Handle "Customer already exists" or other registration errors
        if (custError.response?.data?.message?.includes("already exists") || custError.response?.status === 400) {
          // Try to fetch existing customer
          const fetchResponse = await this.client.get(`/customer/${email}`);
          customerCode = fetchResponse.data.data.customer_code;
        } else {
          throw custError;
        }
      }

      if (!customerCode) throw new Error("Could not resolve Paystack customer code");

      // 2. Request dedicated virtual account
      const response = await this.client.post("/dedicated_account", {
        customer: customerCode,
        preferred_bank: "titan-paystack", // Standard for virtual accounts
      });

      const entry = response.data.data;
      return {
        bankName: entry.bank.name,
        accountNumber: entry.account_number,
        accountName: entry.account_name,
        currency: entry.currency,
        provider: "paystack",
        customerCode: customerCode
      };
    } catch (error) {
      console.error(
        "Paystack Dedicated Account Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message || "Failed to generate virtual account",
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

    return {
      type: type,
      display_label: "Digital Assets Purchase",
      reference: data.reference,
      status: status,
      amount: math.divide(data.amount, 100),
      currency: data.currency,
      userId: data.metadata?.userId || data.metadata?.user_id,
      raw: payload,
    };
  }
}

module.exports = PaystackProvider;
