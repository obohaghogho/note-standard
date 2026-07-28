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
   * Initiate outbound bank transfer.
   * @abstract
   */
  async initiatePayout(params) {
    throw new Error("Method 'initiatePayout()' must be implemented.");
  }

  /**
   * Verify status of a payout by external reference.
   * @abstract
   */
  async verifyPayout(reference) {
    throw new Error("Method 'verifyPayout()' must be implemented.");
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
    if (!(provider instanceof PayoutProvider)) {
      throw new TypeError("Registered provider must extend PayoutProvider.");
    }
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  get(name) {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new Error(`Payout provider '${name}' is not registered.`);
    }
    return provider;
  }

  getPrimary() {
    return this.get(this.primaryProviderName);
  }
}

const registry = new ProviderRegistry();

module.exports = { PayoutProvider, registry };
