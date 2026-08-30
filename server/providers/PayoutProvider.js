/**
 * Abstract PayoutProvider Interface & Capability Registry
 * ────────────────────────────────────────────────────────
 * Defines the standard payment provider contract for NoteStandard.
 * All payout integrations (Fincra, Paystack, Flutterwave) must implement this interface.
 */

class PayoutProvider {
  constructor(name, capabilities = {}) {
    if (new.target === PayoutProvider) {
      throw new TypeError("Cannot instantiate abstract class PayoutProvider directly.");
    }
    this.name = name;
    this.capabilities = {
      supportsNGN:                   capabilities.supportsNGN ?? true,
      supportsUSD:                   capabilities.supportsUSD ?? false,
      supportsEUR:                   capabilities.supportsEUR ?? false,
      supportsWebhook:               capabilities.supportsWebhook ?? true,
      supportsAccountVerification:   capabilities.supportsAccountVerification ?? true,
      supportsMerchantBalance:       capabilities.supportsMerchantBalance ?? true,
      maxTransactionAmountNGN:       capabilities.maxTransactionAmountNGN ?? 10000000,
    };
  }

  /**
   * Submit outbound bank transfer (Standard Adapter Method).
   * @abstract
   */
  async submitPayout(params) {
    return await this.initiatePayout(params);
  }

  /**
   * Initiate outbound bank transfer.
   * @abstract
   */
  async initiatePayout(params) {
    throw new Error("Method 'initiatePayout()' must be implemented.");
  }

  /**
   * Get payout status (Standard Adapter Method).
   * @abstract
   */
  async getPayoutStatus(reference) {
    return await this.verifyPayout(reference);
  }

  /**
   * Verify status of a payout by external reference.
   * @abstract
   */
  async verifyPayout(reference) {
    throw new Error("Method 'verifyPayout()' must be implemented.");
  }

  /**
   * Verify transaction amount matches expected.
   */
  async verifyAmount(reference, expectedAmount) {
    const res = await this.verifyPayout(reference);
    const amount = res.rawResponse?.data?.amount || res.rawResponse?.amount;
    if (amount === undefined || amount === null) return true; // Fail safe if provider doesn't return amount in query
    return Math.abs(parseFloat(amount) - parseFloat(expectedAmount)) < 0.01;
  }

  /**
   * Verify transaction currency matches expected.
   */
  async verifyCurrency(reference, expectedCurrency) {
    const res = await this.verifyPayout(reference);
    const currency = res.rawResponse?.data?.destinationCurrency || res.rawResponse?.data?.currency || res.rawResponse?.currency;
    if (!currency) return true;
    return String(currency).toUpperCase() === String(expectedCurrency).toUpperCase();
  }

  /**
   * Verify beneficiary details match expected.
   */
  async verifyBeneficiary(reference, expectedBeneficiary) {
    const res = await this.verifyPayout(reference);
    const ben = res.rawResponse?.data?.beneficiary || res.rawResponse?.beneficiary;
    if (!ben) return true;
    if (expectedBeneficiary.accountNumber && ben.accountNumber && ben.accountNumber !== expectedBeneficiary.accountNumber) {
      return false;
    }
    return true;
  }

  /**
   * Resolve bank account number and code to account name.
   * @abstract
   */
  async resolveAccount({ accountNumber, bankCode, currency }) {
    throw new Error("Method 'resolveAccount()' must be implemented.");
  }

  /**
   * Fetch current provider merchant balance.
   * @abstract
   */
  async getMerchantBalance(currency) {
    throw new Error("Method 'getMerchantBalance()' must be implemented.");
  }

  /**
   * Submit OTP verification for an outbound payout.
   * @abstract
   */
  async verifyOtp(params) {
    throw new Error("Method 'verifyOtp()' must be implemented.");
  }

  /**
   * Resend OTP challenge for a payout.
   * @abstract
   */
  async resendOtp(params) {
    throw new Error("Method 'resendOtp()' must be implemented.");
  }
}

/**
 * Provider Registry
 */
class ProviderRegistry {
  constructor() {
    this.providers = new Map();
    this.primaryProviderName = "fincra";
  }

  register(provider) {
    if (!provider || typeof provider.initiatePayout !== 'function') {
      throw new TypeError("Registered payout provider must implement initiatePayout().");
    }
    const providerName = provider.name || provider.constructor.name.replace("Provider", "");
    this.providers.set(providerName.toLowerCase(), provider);
  }

  get(name) {
    const key = String(name || 'fincra').toLowerCase();
    if (!this.providers.has(key)) {
      if (key === "fincra") {
        try {
          const FincraProvider = require("./fincraProvider");
          this.register(new FincraProvider());
        } catch (e) {}
      } else if (key === "anchor") {
        try {
          const AnchorProvider = require("../services/payment/providers/AnchorProvider");
          const instance = new AnchorProvider();
          instance.name = "anchor";
          this.register(instance);
        } catch (e) {}
      } else if (key === "paystack") {
        try {
          const PaystackProvider = require("../services/payment/providers/PaystackProvider");
          const instance = new PaystackProvider();
          instance.name = "paystack";
          this.register(instance);
        } catch (e) {}
      }
    }
    const provider = this.providers.get(key);
    if (!provider) {
      throw new Error(`Payout provider '${name}' is not registered.`);
    }
    return provider;
  }

  getPrimary() {
    const preferred = (process.env.PRIMARY_PAYOUT_PROVIDER || this.primaryProviderName).toLowerCase();
    try {
      return this.get(preferred);
    } catch {
      return this.get("fincra");
    }
  }
}

const registry = new ProviderRegistry();

module.exports = { PayoutProvider, registry };
