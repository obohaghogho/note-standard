const axios = require("axios");
const crypto = require("crypto");
const BaseProvider = require("./BaseProvider");

class FlutterwaveProvider extends BaseProvider {
  constructor() {
    super();
    this.secretKey = process.env.FLUTTERWAVE_SECRET_KEY;
    this.baseUrl = "https://api.flutterwave.com/v3";
    this.client = axios.create({
      baseURL: this.baseUrl,
      headers: {
        Authorization: `Bearer ${this.secretKey}`,
        "Content-Type": "application/json",
      },
    });
  }

  async initialize(data) {
    const { email, amount, currency, reference, callbackUrl, metadata } = data;

    try {
      const response = await this.client.post("/payments", {
        tx_ref: reference,
        amount: amount,
        currency: currency,
        redirect_url: callbackUrl,
        customer: {
          email: email,
        },
        meta: {
          ...metadata,
          category: "digital_assets",
          product_type: "digital_asset",
        },
        customizations: {
          title: "Digital Assets Purchase",
          description: "Digital Assets Purchase",
        },
      });

      return {
        checkoutUrl: response.data.data.link,
        providerReference: response.data.data.id,
      };
    } catch (error) {
      console.error(
        "Flutterwave Init Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message || "Flutterwave initialization failed",
      );
    }
  }

  async verify(reference) {
    try {
      // Use the specific transaction ID verification if it looks like a numeric ID or a Flutterwave ID
      // Otherwise fallback to verify_by_reference (tx_ref)
      let endpoint = `/transactions/verify_by_reference?tx_ref=${reference}`;

      // If reference is a number or contains only digits, treat as transaction ID
      if (/^\d+$/.test(reference)) {
        endpoint = `/transactions/${reference}/verify`;
      }

      console.log(`[FlutterwaveProvider] Verifying via endpoint: ${endpoint}`);
      const response = await this.client.get(endpoint);

      const data = response.data.data;
      const { status, amount, currency, tx_ref } = data;

      // MAP INTERNAL STATUS: PaymentService expects 'success' or 'failed'
      const mappedStatus = status === "successful"
        ? "success"
        : (["failed", "cancelled"].includes(status) ? "failed" : "pending");

      return {
        success: response.data.status === "success" && status === "successful",
        status: mappedStatus,
        amount: amount,
        currency: currency,
        reference: tx_ref,
        provider: "flutterwave",
        raw: data,
      };
    } catch (error) {
      console.error(
        "Flutterwave Verify Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message || "Flutterwave verification failed",
      );
    }
  }

  verifyWebhookSignature(headers, body, rawBody = null) {
    const signature = headers["verif-hash"];
    const secretHash = process.env.FLW_SECRET_HASH ||
      process.env.FLUTTERWAVE_WEBHOOK_SECRET;
    return signature && secretHash && signature === secretHash;
  }

  /**
   * Request a virtual account for NGN/USD/EUR deposits
   */
  async createVirtualAccount(data) {
    const { currency, email, firstName, lastName, phone } = data;
    try {
      const response = await this.client.post("/virtual-account-numbers", {
        email: email,
        is_permanent: false,
        tx_ref: `va_${Date.now()}_${email.substring(0, 5)}`,
        currency: currency,
        firstname: firstName,
        lastname: lastName,
        phonenumber: phone,
      });

      const entry = response.data.data;
      return {
        bankName: entry.bank_name,
        accountNumber: entry.account_number,
        accountName: `${firstName} ${lastName}`,
        currency: entry.currency,
        reference: entry.flw_ref,
        provider: "flutterwave",
      };
    } catch (error) {
      console.error(
        "Flutterwave Virtual Account Error:",
        error.response?.data || error.message,
      );
      throw new Error(
        error.response?.data?.message || "Failed to generate virtual account",
      );
    }
  }

  parseWebhookEvent(payload) {
    const event = payload.event || (payload["event.type"]);
    const data = payload.data || payload;

    let status = "pending";
    if (data.status === "successful") status = "success";
    else if (data.status === "failed") status = "failed";

    return {
      type: "DEPOSIT",
      display_label: "Digital Assets Purchase",
      reference: data.tx_ref || data.reference,
      status: status,
      amount: data.amount,
      currency: data.currency,
      userId: data.meta?.userId || data.meta?.user_id ||
        (data.metadata ? data.metadata.userId : null),
      raw: payload,
    };
  }

  async transfer(data) {
    const { amount, currency, destination } = data;
    try {
      if (!this.secretKey || this.secretKey === "flutterwave_test_placeholder") {
        return { success: true, status: "success", reference: `tr_flutterwave_${Date.now()}` };
      }
      const res = await this.client.post("/transfers", {
        account_bank: destination.bankCode,
        account_number: destination.accountNumber,
        amount: amount,
        narration: data.reason || "Wallet transfer narration",
        currency: currency.toUpperCase(),
        reference: `tr_flw_${Date.now()}`,
        callback_url: data.callbackUrl
      });
      return {
        success: true,
        status: res.data.data.status,
        reference: res.data.data.reference,
        raw: res.data.data
      };
    } catch (error) {
      console.error("[FlutterwaveProvider] Transfer error:", error.response?.data || error.message);
      throw new Error(error.response?.data?.message || "Flutterwave transfer failed");
    }
  }

  async reverse(reference, reason) {
    try {
      if (!this.secretKey || this.secretKey === "flutterwave_test_placeholder") {
        return { success: true, status: "reversed", reference: `re_flutterwave_${Date.now()}` };
      }
      // Refund endpoint
      const res = await this.client.post(`/transactions/${reference}/refund`, {
        amount: reason.amount, // optional override
        comments: reason
      });
      return {
        success: true,
        status: "reversed",
        reference: res.data.data.reference || `re_flw_${Date.now()}`,
        raw: res.data.data
      };
    } catch (error) {
      console.error("[FlutterwaveProvider] Refund error:", error.response?.data || error.message);
      throw new Error(error.response?.data?.message || "Flutterwave refund failed");
    }
  }

  async balanceInquiry(currency) {
    try {
      if (!this.secretKey || this.secretKey === "flutterwave_test_placeholder") {
        return { balance: 200000.0, currency: currency.toUpperCase() };
      }
      const res = await this.client.get(`/balances/${currency.toUpperCase()}`);
      return {
        balance: res.data.data.available_balance || 0.0,
        currency: currency.toUpperCase()
      };
    } catch (error) {
      return { balance: 0.0, currency: currency.toUpperCase() };
    }
  }

  async healthCheck() {
    try {
      const start = Date.now();
      // Try to fetch balances list
      await this.client.get("/balances");
      return { status: "healthy", latencyMs: Date.now() - start };
    } catch {
      return { status: "unhealthy", latencyMs: 999 };
    }
  }

  async settlement(data) {
    try {
      if (!this.secretKey || this.secretKey === "flutterwave_test_placeholder") return [];
      const res = await this.client.get("/settlements");
      return res.data.data || [];
    } catch {
      return [];
    }
  }
}

module.exports = FlutterwaveProvider;
