const axios = require("axios");
const crypto = require("crypto");
const https = require("https");
const logger = require("../utils/logger");

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const NOWPAYMENTS_IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET;
let baseUrl = process.env.NOWPAYMENTS_BASE_URL || "https://api.nowpayments.io";

if (!baseUrl.includes("/v1")) {
  baseUrl = `${baseUrl.replace(/\/$/, "")}/v1`;
}

/**
 * Configure Axios with fintech-grade defaults
 * - Persistent connections to prevent socket hang-ups
 * - Strict timeout
 */
const nowpayments = axios.create({
  baseURL: baseUrl,
  headers: {
    "x-api-key": NOWPAYMENTS_API_KEY,
    "Content-Type": "application/json",
  },
  httpsAgent: new https.Agent({ keepAlive: true }),
  timeout: 30000,
});

/**
 * Create a payment
 */
exports.createNowPaymentsPayment = async (data) => {
  try {
    const payload = {
      price_amount: data.amount,
      price_currency: data.currency.toLowerCase(),
      pay_currency: data.payCurrency || "btc",
      ipn_callback_url: data.ipnCallbackUrl,
      order_id: data.orderId,
      order_description: data.orderDescription,
    };

    const response = await nowpayments.post("/payment", payload);

    return {
      payment_id: response.data.payment_id,
      pay_address: response.data.pay_address,
      payment_status: response.data.payment_status,
      pay_amount: response.data.pay_amount,
      checkout_url: response.data.invoice_url ||
        `https://nowpayments.io/payment/?iid=${response.data.payment_id}`,
    };
  } catch (error) {
    logger.error("NowPayments: Payment Creation Failed", {
      error: error.response?.data || error.message,
      orderId: data.orderId,
    });
    throw new Error(
      error.response?.data?.message || "Crypto gateway initialization failed",
    );
  }
};

/**
 * Verify IPN Signature (HMAC SHA-512)
 * Fintech logic:
 * 1. Sort fields alphabetically
 * 2. stringify (no spaces)
 * 3. HMAC-SHA512
 */
exports.verifyIPNSignature = (headers, body, rawBody = null) => {
  try {
    const signature = headers["x-nowpayments-sig"];
    if (!signature || !NOWPAYMENTS_IPN_SECRET) {
      logger.warn("IPN Verification: Missing signature or secret");
      return false;
    }

    // NowPayments requires alphabetical sorting of keys
    // And standard JSON stringification with NO spaces
    const orderedBody = Object.keys(body)
      .sort()
      .reduce((obj, key) => {
        obj[key] = body[key];
        return obj;
      }, {});

    const hmac = crypto.createHmac("sha512", NOWPAYMENTS_IPN_SECRET);
    const hash = hmac.update(JSON.stringify(orderedBody)).digest("hex");

    const isValid = hash === signature;
    if (!isValid) {
      // Try alternative: some users report raw body signature check for NowPayments might be needed if JSON.stringify differs
      // But standard implementation is sorted JSON.
      // We will trust the sorted JSON method for now as per docs.
      logger.warn("IPN Verification: Invalid Signature Detected", {
        providedSig: signature.substring(0, 8),
        expectedHash: hash.substring(0, 8),
      });
    }

    return isValid;
  } catch (error) {
    logger.error("IPN Verification: Error during check", {
      error: error.message,
    });
    return false;
  }
};

/**
 * Get Payment Status (Direct API Check)
 */
exports.getPaymentStatus = async (paymentId) => {
  try {
    const response = await nowpayments.get(`/payment/${paymentId}`);
    return response.data;
  } catch (error) {
    logger.error("NowPayments: Status Fetch Failed", {
      paymentId,
      error: error.response?.data || error.message,
    });
    throw error;
  }
};
