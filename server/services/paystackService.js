const axios = require("axios");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PAYSTACK_BASE_URL = "https://api.paystack.co";

const paystack = axios.create({
  baseURL: PAYSTACK_BASE_URL,
  headers: {
    Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    "Content-Type": "application/json",
  },
});

/**
 * Initialize a transaction
 * @param {string} email - Customer email
 * @param {number} amount - Amount in kobo/cents
 * @param {string} callbackUrl - URL to redirect to after payment
 * @param {object} metadata - Custom metadata
 * @param {string} [plan] - Optional plan code for subscriptions
 */
exports.initializeTransaction = async (
  email,
  amount,
  callbackUrl,
  metadata = {},
  reference = null,
  plan = null,
) => {
  try {
    const payload = {
      email,
      amount: Math.round(amount), // Ensure integer
      callback_url: callbackUrl,
      metadata: JSON.stringify(metadata),
    };

    if (reference) {
      payload.reference = reference;
    }

    if (plan) {
      payload.plan = plan;
    }

    const response = await paystack.post("/transaction/initialize", payload);
    return response.data.data;
  } catch (error) {
    console.error(
      "Paystack Initialize Error:",
      error.response?.data || error.message,
    );
    throw new Error(
      error.response?.data?.message || "Payment initialization failed",
    );
  }
};

/**
 * Verify a transaction
 * @param {string} reference
 */
exports.verifyTransaction = async (reference) => {
  try {
    const response = await paystack.get(`/transaction/verify/${reference}`);
    return response.data.data;
  } catch (error) {
    console.error(
      "Paystack Verify Error:",
      error.response?.data || error.message,
    );
    throw new Error(
      error.response?.data?.message || "Payment verification failed",
    );
  }
};

/**
 * Create or Fetch Customer
 * @param {string} email
 * @param {string} firstName
 * @param {string} lastName
 */
exports.createCustomer = async (email, firstName, lastName) => {
  try {
    const response = await paystack.post("/customer", {
      email,
      first_name: firstName,
      last_name: lastName,
    });
    return response.data.data;
  } catch (error) {
    console.error(
      "Paystack Create Customer Error:",
      error.response?.data || error.message,
    );
    // If customer exists, we might get an error or success depending on endpoint behavior,
    // typically 400 if duplicate, but we can ignore or handle gracefully
    throw new Error(
      error.response?.data?.message || "Customer creation failed",
    );
  }
};

/**
 * List Plans
 */
exports.listPlans = async () => {
  try {
    const response = await paystack.get("/plan");
    return response.data.data;
  } catch (error) {
    console.error(
      "Paystack List Plans Error:",
      error.response?.data || error.message,
    );
    throw error;
  }
};

/**
 * Cancel Subscription
 * @param {string} codeOrToken - Subscription code or token
 */
exports.disableSubscription = async (code, token) => {
  try {
    const response = await paystack.post("/subscription/disable", {
      code,
      token,
    });
    return response.data.data;
  } catch (error) {
    console.error(
      "Paystack Disable Subscription Error:",
      error.response?.data || error.message,
    );
    throw error;
  }
};
