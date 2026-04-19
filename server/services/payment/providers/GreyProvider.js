const BaseProvider = require("./BaseProvider");
const supabase = require("../../../config/database");
const logger = require("../../../utils/logger");
const GreyEmailService = require("../GreyEmailService");

/**
 * Grey Payment Provider
 *
 * Handles manual bank transfer payments via Grey.
 * Grey has NO API — all verification happens through:
 * 1. Brevo email parsing (automatic)
 * 2. Admin manual confirmation (fallback)
 *
 * Flow:
 * 1. User requests payment → We generate reference + show bank details
 * 2. User transfers money with reference in narration
 * 3. Grey sends email notification
 * 4. Brevo forwards email to our webhook
 * 5. We parse email, match reference, credit user
 */
class GreyProvider extends BaseProvider {
  constructor() {
    super();
    this.expiryMinutes = parseInt(process.env.GREY_EXPIRY_MINUTES || "60", 10);
  }

  /**
   * Initialize a Grey payment.
   * Returns bank instructions + generated reference instead of a checkout URL.
   *
   * @param {Object} data - Payment data
   * @returns {Object} { checkoutUrl: null, providerReference, instructions, expiresAt }
   */
  async initialize(data) {
    const { currency, reference, amount, metadata } = data;
    const upCurrency = String(currency).toUpperCase();

    logger.info(`[GreyProvider] Initializing manual payment for ${upCurrency}`, {
      reference,
      amount,
    });

    // 1. Fetch Bank Instructions for this currency
    const { data: instructions, error } = await supabase
      .from("grey_instructions")
      .select("*")
      .eq("currency", upCurrency)
      .maybeSingle();

    if (error || !instructions) {
      logger.error(`[GreyProvider] Missing bank instructions for ${upCurrency}`, {
        error,
      });
      throw new Error(
        `Bank transfer instructions not available for ${upCurrency}. Please contact support.`
      );
    }

    // 2. Generate user-friendly reference if not already NOTE- format
    const userId = data.metadata?.user_id || data.userId || "system";
    const userReference = reference.startsWith("NOTE-") || reference.startsWith("NS-")
      ? reference
      : GreyEmailService.generateReference(userId);

    // 3. Calculate expiration time
    const expiresAt = new Date(
      Date.now() + this.expiryMinutes * 60 * 1000
    ).toISOString();

    // 4. Update payment record with Grey-specific data
    try {
      await supabase
        .from("payments")
        .update({
          method: "grey",
          expires_at: expiresAt,
          metadata: {
            ...(metadata || {}),
            user_reference: userReference,
            bank_details: {
              bank_name: instructions.bank_name,
              account_name: instructions.account_name,
              account_number: instructions.account_number,
            },
          },
        })
        .eq("reference", reference);
    } catch (updateErr) {
      logger.warn("[GreyProvider] Could not update payment metadata:", updateErr.message);
    }

    // 5. Return instructions for the frontend
    return {
      checkoutUrl: null, // No external checkout for manual flow
      providerReference: userReference,
      expiresAt,
      instructions: {
        bank_name: instructions.bank_name,
        account_name: instructions.account_name,
        account_number: instructions.account_number,
        swift_code: instructions.swift_code || null,
        iban: instructions.iban || null,
        additional_info: instructions.instructions,
        reference: userReference,
        amount,
        currency: upCurrency,
        expires_at: expiresAt,
        expiry_minutes: this.expiryMinutes,
        critical_warning: "You MUST include this exact reference in your bank transfer narration/memo or your payment will not be processed.",
      },
    };
  }

  /**
   * Verify a Grey transaction.
   * Since Grey has no API, we check our local database.
   * The payment gets marked as 'success' by the Brevo email webhook or admin.
   *
   * @param {string} reference - Payment reference
   * @returns {Object} Verification result
   */
  async verify(reference) {
    // Check payments table (our source of truth for Grey)
    const { data: payment, error } = await supabase
      .from("payments")
      .select("status, amount, currency, credited, metadata, expires_at")
      .or(`reference.eq.${reference},metadata->>user_reference.eq.${reference}`)
      .maybeSingle();

    if (error || !payment) {
      return {
        success: false,
        status: "failed",
        message: "Transaction not found",
      };
    }

    // Check if payment has expired
    if (
      payment.status === "pending" &&
      payment.expires_at &&
      new Date(payment.expires_at) < new Date()
    ) {
      return {
        success: false,
        status: "expired",
        message: "Payment window has expired",
      };
    }

    return {
      success: payment.status === "success",
      status: payment.status,
      amount: payment.amount,
      currency: payment.currency,
      metadata: payment.metadata,
    };
  }

  /**
   * Verify webhook signature for Grey/Brevo emails.
   * Uses the Brevo inbound secret or the Grey webhook key.
   *
   * @param {Object} headers - Request headers
   * @param {Object} body - Request body
   * @returns {boolean}
   */
  verifyWebhookSignature(headers, body) {
    const WebhookSignatureService = require("../WebhookSignatureService");

    // Try SendGrid verification
    if (WebhookSignatureService.verifySendGrid(headers, body)) {
      return true;
    }

    // Fallback: Static secret for direct Grey callbacks or admin tools
    const secret = process.env.GREY_WEBHOOK_SECRET;
    if (secret) {
      const incomingSecret =
        headers["x-grey-webhook-key"] ||
        headers["x-api-key"] ||
        body?.secret;
      return incomingSecret === secret;
    }

    // In dev mode, allow through with warning
    if (process.env.NODE_ENV !== "production") {
      logger.warn("[GreyProvider] No verification secret configured. Dev mode: allowing through.");
      return true;
    }

    return false;
  }

  /**
   * Parse a direct Grey webhook payload (non-email path).
   * Maps Grey's structure to our unified event format.
   *
   * @param {Object} payload - Webhook payload
   * @returns {Object} Unified event
   */
  parseWebhookEvent(payload) {
    const status =
      payload.status === "completed" ||
      payload.status === "successful" ||
      payload.status === "success"
        ? "success"
        : "failed";

    return {
      type: "deposit",
      reference:
        payload.reference || payload.narration || payload.memo || null,
      status,
      amount: payload.amount,
      currency: payload.currency,
      sender: payload.sender_name || payload.sender || "Unknown",
      transactionId: payload.transaction_id || payload.id || null,
      raw: payload,
    };
  }
}

module.exports = GreyProvider;
