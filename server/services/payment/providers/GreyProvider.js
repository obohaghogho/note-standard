const BaseProvider = require("./BaseProvider");
const supabase = require("../../../config/database");
const logger = require("../../../utils/logger");

/**
 * Grey Payment Provider
 * =====================
 * Handles bank transfer payments and virtual USD checking account provisioning via Grey / Lead Bank.
 */
class GreyProvider extends BaseProvider {
  constructor() {
    super();
    this.expiryMinutes = parseInt(process.env.GREY_EXPIRY_MINUTES || "60", 10);
    this.accountHolder = (process.env.GREY_LEAD_BANK_HOLDER || 'JOSSY DIGITAL TECHNOLOGIES LTD').trim();
    this.bankName = (process.env.GREY_LEAD_BANK_NAME || 'Lead Bank').trim();
    this.accountNumber = (process.env.GREY_LEAD_BANK_ACCOUNT_NUMBER || '217394889898').trim();
    this.achRouting = (process.env.GREY_LEAD_BANK_ACH_ROUTING || '101019644').trim();
    this.wireRouting = (process.env.GREY_LEAD_BANK_WIRE_ROUTING || '101019644').trim();
    this.bankAddress = (process.env.GREY_LEAD_BANK_ADDRESS || '1801 Main St., Kansas City, MO 64108').trim();
  }

  /**
   * Initialize a Grey Lead Bank payment.
   */
  async initialize(data) {
    const { currency, reference, amount, metadata } = data;
    const upCurrency = String(currency || 'USD').toUpperCase();

    logger.info(`[GreyProvider] Initializing payment for ${upCurrency}`, { reference, amount });

    const userReference = reference.startsWith("NOTE-") || reference.startsWith("NS-")
      ? reference
      : `NS-${String(data.userId || 'GEN').replace(/-/g, '').substring(0, 8).toUpperCase()}`;

    const expiresAt = new Date(Date.now() + this.expiryMinutes * 60 * 1000).toISOString();

    const instructions = {
      bank_name: this.bankName,
      account_name: this.accountHolder,
      account_number: this.accountNumber,
      ach_routing: this.achRouting,
      wire_routing: this.wireRouting,
      bank_address: this.bankAddress,
      account_type: 'Checking',
      reference: userReference,
      amount,
      currency: upCurrency,
      expires_at: expiresAt,
      expiry_minutes: this.expiryMinutes,
      ach_fee: "$2.00 Flat Fee",
      wire_fee: "$15.00 Flat Fee",
      critical_warning: "USD payments can only be received from banks within the United States. SWIFT is NOT supported.",
      notices: [
        'Receiving payments via ACH has a flat fee of $2. Please use the ACH routing number to receive payments via ACH.',
        'Receiving payments via WIRE has a flat fee of $15.',
        'Receiving payments via SWIFT is currently not supported.',
        'USD payments can only be received from banks within the United States.',
        'Processing time for incoming payments can take between 1-3 days, depending on the payment scheme used by the sending bank.'
      ]
    };

    try {
      await supabase
        .from("payments")
        .update({
          method: "grey",
          expires_at: expiresAt,
          metadata: {
            ...(metadata || {}),
            user_reference: userReference,
            bank_details: instructions,
          },
        })
        .eq("reference", reference);
    } catch (updateErr) {
      logger.warn("[GreyProvider] Could not update payment metadata:", updateErr.message);
    }

    const bankDetailsObj = {
      bankName: this.bankName,
      accountName: this.accountHolder,
      accountNumber: this.accountNumber,
      routingNumber: this.achRouting,
      achRouting: this.achRouting,
      wireRouting: this.wireRouting,
      bankAddress: this.bankAddress,
      accountType: 'Checking',
      reference: userReference,
      amount,
      currency: upCurrency,
      expiresAt,
      note: 'USD payments can only be received from banks within the United States. Include reference in transfer details.'
    };

    return {
      checkoutUrl: null,
      providerReference: userReference,
      expiresAt,
      instructions,
      bankDetails: bankDetailsObj
    };
  }

  async verify(reference) {
    const { data: payment, error } = await supabase
      .from("payments")
      .select("status, amount, currency, credited, metadata, expires_at")
      .or(`reference.eq.${reference},metadata->>user_reference.eq.${reference}`)
      .maybeSingle();

    if (error || !payment) {
      return { success: false, status: "failed", message: "Transaction not found" };
    }

    return {
      success: payment.status === "success" || payment.status === "COMPLETED",
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      metadata: payment.metadata,
    };
  }

  verifyWebhookSignature(headers, body) {
    const GreyBankingProvider = require('../../settlement/GreyBankingProvider');
    const p = new GreyBankingProvider();
    return p.verifyWebhook(headers, body);
  }

  parseWebhookEvent(payload) {
    const status = ['completed', 'successful', 'success', 'transaction success'].includes(String(payload.status || payload.event).toLowerCase())
      ? "success"
      : "failed";

    return {
      type: "deposit",
      reference: payload.reference || payload.narration || payload.memo || null,
      status,
      amount: payload.amount,
      currency: payload.currency || 'USD',
      sender: payload.sender_name || payload.sender || "Unknown",
      transactionId: payload.transaction_id || payload.id || null,
      raw: payload,
    };
  }

  async createVirtualAccount(data) {
    return {
      bank_name: this.bankName,
      bankName: this.bankName,
      account_number: this.accountNumber,
      accountNumber: this.accountNumber,
      account_name: this.accountHolder,
      accountName: this.accountHolder,
      routingNumber: this.achRouting,
      achRouting: this.achRouting,
      wireRouting: this.wireRouting,
      bankAddress: this.bankAddress,
      accountType: 'Checking',
      currency: (data.currency || 'USD').toUpperCase(),
      reference: `va_grey_${Date.now()}`,
      provider: "grey",
      status: 'ACTIVE',
      metadata: {
        routingNumber: this.achRouting,
        achRouting: this.achRouting,
        wireRouting: this.wireRouting,
        bankAddress: this.bankAddress,
        accountType: 'Checking'
      }
    };
  }

  async transfer(data) {
    return { success: true, status: "success", reference: `tr_grey_${Date.now()}` };
  }

  async reverse(reference, reason) {
    return { success: true, status: "reversed", reference: `re_grey_${Date.now()}` };
  }

  async balanceInquiry(currency) {
    return { balance: 100000.0, currency: (currency || 'USD').toUpperCase() };
  }

  async healthCheck() {
    return { status: "healthy", latencyMs: 25 };
  }
}

module.exports = GreyProvider;
