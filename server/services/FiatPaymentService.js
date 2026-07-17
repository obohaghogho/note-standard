const paystackService = require("./paystackService");
const logger = require("../utils/logger");

/**
 * FiatPaymentService
 * Strictly handles fiat operations via Paystack. No crypto code allowed.
 */
class FiatPaymentService {
  /**
   * Initializes a fiat payment transaction to get a checkout URL.
   * @param {string} email - Customer email
   * @param {number} amount - Amount in standard unit (e.g. Naira)
   * @param {string} currency - Processing currency (e.g., NGN)
   * @param {string} callbackUrl - URL to redirect to after payment
   * @param {object} metadata - Custom metadata
   * @param {string} [reference] - Optional reference
   */
  async initializePayment(email, amount, currency, callbackUrl, metadata = {}, reference = null) {
    if (["BTC", "ETH", "USDT", "USDC"].includes(String(currency).toUpperCase())) {
      throw new Error("Crypto currencies are strictly forbidden in FiatPaymentService.");
    }
    
    // Convert to minor units (e.g., kobo/cents) for Paystack
    const amountInMinorUnits = Math.round(amount * 100);

    try {
      const data = await paystackService.initializeTransaction(
        email,
        amountInMinorUnits,
        currency,
        callbackUrl,
        metadata,
        reference
      );
      return data;
    } catch (error) {
      logger.error("[FiatPaymentService] Failed to initialize payment", error);
      throw error;
    }
  }

  /**
   * Verifies a fiat payment transaction via Paystack.
   * @param {string} reference
   */
  async verifyPayment(reference) {
    try {
      const data = await paystackService.verifyTransaction(reference);
      return data;
    } catch (error) {
      logger.error(`[FiatPaymentService] Failed to verify payment ${reference}`, error);
      throw error;
    }
  }

  /**
   * Generates a dedicated virtual account for bank transfers via Paystack.
   * @param {string} email 
   * @param {string} firstName 
   * @param {string} lastName 
   * @param {string} phone 
   */
  async getDedicatedAccount(email, firstName, lastName, phone) {
    const PaystackProvider = require("./payment/providers/PaystackProvider");
    const provider = new PaystackProvider();
    return await provider.getDedicatedAccount(email, firstName, lastName, phone);
  }
}

module.exports = new FiatPaymentService();
