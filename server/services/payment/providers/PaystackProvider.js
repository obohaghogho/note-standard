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

    // --- PAYSTACK MULTI-CURRENCY ROUTING (DFOS v6.3) ---
    // Paystack (especially Nigerian accounts) primarily supports NGN and USD.
    // If the currency is not NGN or USD, we convert it to USD to ensure a
    // professional international experience for the user.
    if (!["NGN", "USD"].includes(currency)) {
      const fxService = require("../../fxService");
      try {
        const rate = await fxService.getRate(currency, "USD");
        amount = amount * rate;
        currency = "USD";
        metadata = { ...metadata, paystack_converted: true, original_currency: data.currency };
      } catch (fxErr) {
        console.warn(`[Paystack] USD fallback failed: ${fxErr.message}. Attempting native initialization.`);
      }
    }

    // Sandbox Safety: Paystack Sandbox often only supports NGN.
    // If we are in test mode and the currency is USD, we convert to NGN for testing stability.
    const isTestKey = this.secretKey && this.secretKey.includes("test");
    if (isTestKey && currency === "USD") {
      const fxService = require("../../fxService");
      try {
        const rate = await fxService.getRate("USD", "NGN");
        amount = amount * rate;
        currency = "NGN";
        metadata = { ...metadata, sandbox_converted: true };
      } catch (fxErr) {
        console.warn(`[Paystack] Sandbox NGN fallback failed: ${fxErr.message}`);
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
      // Note: "preferred_bank" is optional but titan-paystack is reliable
      const response = await this.client.post("/dedicated_account", {
        customer: customerCode,
        preferred_bank: "titan-paystack", 
      });

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
      console.error(
        "Paystack Dedicated Account Error:",
        error.response?.data || error.message,
      );
      
      // Specific error for bank downtime
      if (error.response?.data?.message?.includes("bank") && error.response?.data?.message?.includes("downtime")) {
          throw new Error("Paystack's partner banks are currently experiencing downtime. Please try again later or use Card payment.");
      }

      throw new Error(
        error.response?.data?.message || "Failed to generate virtual account"
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
