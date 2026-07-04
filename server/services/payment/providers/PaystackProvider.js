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
    const { normalizeToSmallestUnit } = require("../../../config/currencyMetadata");

    // Enforce currency presence
    if (!currency) {
      throw new Error("[PaystackProvider] Currency is strictly required for initialization");
    }

    const upCurrency = String(currency).toUpperCase();

    // Enforce precision-safe normalization to smallest unit (cents/kobo/etc)
    const amountInSmallestUnit = normalizeToSmallestUnit(amount, upCurrency);

    console.log(`[PaystackProvider] Initializing transaction: ${amount} ${upCurrency} (${amountInSmallestUnit} units) for ${email}`);

    try {
      const response = await this.client.post("/transaction/initialize", {
        email,
        amount: amountInSmallestUnit,
        currency: upCurrency,
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
    const { formatFromSmallestUnit } = require("../../../config/currencyMetadata");

    return {
      type: type,
      display_label: data.metadata?.display_label || "Digital Assets Purchase",
      reference: data.reference,
      status: status,
      amount: formatFromSmallestUnit(data.amount, data.currency),
      currency: data.currency,
      userId: userId,
      customerCode: data.customer?.customer_code,
      accountNumber: data.dedicated_account?.account_number,
      raw: payload,
    };
  }

  async createVirtualAccount(data) {
    return this.getDedicatedAccount(data.email, data.firstName, data.lastName, data.phone);
  }

  async transfer(data) {
    const { amount, currency, destination } = data;
    try {
      if (!this.secretKey || this.secretKey === "paystack_test_placeholder") {
        return { success: true, status: "success", reference: `tr_paystack_${Date.now()}` };
      }
      // Create transfer recipient
      const recipientRes = await this.client.post("/transferrecipient", {
        type: "nuban",
        name: destination.accountName,
        account_number: destination.accountNumber,
        bank_code: destination.bankCode,
        currency: currency.toUpperCase()
      });
      
      const recipientCode = recipientRes.data.data.recipient_code;

      // Initiate transfer
      const transferRes = await this.client.post("/transfer", {
        source: "balance",
        reason: data.reason || "Wallet transfer",
        amount: Math.round(amount * 100),
        recipient: recipientCode
      });

      return {
        success: true,
        status: transferRes.data.data.status,
        reference: transferRes.data.data.reference,
        raw: transferRes.data.data
      };
    } catch (error) {
      console.error("[PaystackProvider] Transfer error:", error.response?.data || error.message);
      throw new Error(error.response?.data?.message || "Paystack transfer failed");
    }
  }

  async reverse(reference, reason) {
    try {
      if (!this.secretKey || this.secretKey === "paystack_test_placeholder") {
        return { success: true, status: "reversed", reference: `re_paystack_${Date.now()}` };
      }
      const res = await this.client.post("/refund", {
        transaction: reference,
        merchant_note: reason
      });
      return {
        success: true,
        status: "reversed",
        reference: res.data.data.reference,
        raw: res.data.data
      };
    } catch (error) {
      console.error("[PaystackProvider] Refund error:", error.response?.data || error.message);
      throw new Error(error.response?.data?.message || "Paystack refund failed");
    }
  }

  async balanceInquiry(currency) {
    try {
      if (!this.secretKey || this.secretKey === "paystack_test_placeholder") {
        return { balance: 150000.0, currency: currency.toUpperCase() };
      }
      const res = await this.client.get("/balance");
      const balanceItem = res.data.data?.find(b => b.currency.toUpperCase() === currency.toUpperCase());
      return {
        balance: balanceItem ? balanceItem.balance / 100 : 0.0,
        currency: currency.toUpperCase()
      };
    } catch (error) {
      return { balance: 0.0, currency: currency.toUpperCase() };
    }
  }

  async healthCheck() {
    try {
      const start = Date.now();
      await this.client.get("/balance");
      return { status: "healthy", latencyMs: Date.now() - start };
    } catch {
      return { status: "unhealthy", latencyMs: 999 };
    }
  }

  async settlement(data) {
    try {
      if (!this.secretKey || this.secretKey === "paystack_test_placeholder") return [];
      const res = await this.client.get("/settlement");
      return res.data.data || [];
    } catch {
      return [];
    }
  }
}

module.exports = PaystackProvider;
