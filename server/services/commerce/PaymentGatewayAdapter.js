/**
 * Phase 4B: Payment Gateway Adapter
 * Provider-agnostic interface for handling checkouts and webhooks.
 * Implementations (Paystack, NOWPayments) are plugged into this adapter.
 */
class PaymentGatewayAdapter {
  constructor() {
    this.providers = new Map();
  }

  registerProvider(name, providerInstance) {
    this.providers.set(name, providerInstance);
  }

  _getProvider(name) {
    const provider = this.providers.get(name);
    if (!provider) throw new Error(`Payment provider '${name}' is not registered.`);
    return provider;
  }

  /**
   * Initialize a checkout session.
   * @param {string} providerName - e.g., 'paystack'
   * @param {Object} payload - { amount, currency, productId, userId, email, metadata }
   * @returns {Promise<Object>} - { checkoutUrl, txId }
   */
  async createCheckoutSession(providerName, payload) {
    const provider = this._getProvider(providerName);
    return await provider.createSession(payload);
  }

  /**
   * Verify a transaction's status directly with the provider.
   */
  async verifyTransaction(providerName, txId) {
    const provider = this._getProvider(providerName);
    return await provider.verifyTransaction(txId);
  }

  /**
   * Parse an incoming webhook and normalize it to a standard NoteStandard event.
   * @returns {Object} - { eventType: 'payment_success'|'refund', txId, amount, productId, userId, raw }
   */
  async normalizeWebhook(providerName, req) {
    const provider = this._getProvider(providerName);
    // Provider implementation MUST validate the webhook signature
    return await provider.handleWebhook(req);
  }
}

// Instantiate the singleton
const paymentAdapter = new PaymentGatewayAdapter();

// ============================================================
// STUB PROVIDERS (For v1.5 implementation)
// ============================================================

class PaystackProvider {
  async createSession(payload) {
    // In reality: call Paystack API
    return {
      checkoutUrl: `https://checkout.paystack.com/stub_${Date.now()}`,
      txId: `ps_tx_${Date.now()}`
    };
  }
  async verifyTransaction(txId) {
    return { status: 'completed', txId };
  }
  async handleWebhook(req) {
    // Validate signature via req.headers['x-paystack-signature']
    return {
      eventType: req.body.event === 'charge.success' ? 'payment_success' : 'unknown',
      txId: req.body.data.reference,
      amount: req.body.data.amount / 100,
      productId: req.body.data.metadata.product_id,
      userId: req.body.data.metadata.user_id,
      raw: req.body
    };
  }
}

class NOWPaymentsProvider {
  async createSession(payload) {
    return {
      checkoutUrl: `https://nowpayments.io/payment/stub_${Date.now()}`,
      txId: `np_tx_${Date.now()}`
    };
  }
  async verifyTransaction(txId) {
    return { status: 'completed', txId };
  }
  async handleWebhook(req) {
    // Validate signature via req.headers['x-nowpayments-sig']
    return {
      eventType: req.body.payment_status === 'finished' ? 'payment_success' : 'unknown',
      txId: req.body.payment_id,
      amount: req.body.price_amount,
      productId: req.body.order_id,
      userId: req.body.order_description, // Or extract from a custom field
      raw: req.body
    };
  }
}

// Register initial providers
paymentAdapter.registerProvider('paystack', new PaystackProvider());
paymentAdapter.registerProvider('nowpayments', new NOWPaymentsProvider());

module.exports = paymentAdapter;
