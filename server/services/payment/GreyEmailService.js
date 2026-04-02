const { JSDOM } = require("jsdom");
const createDOMPurify = require("dompurify");
const logger = require("../../utils/logger");

const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

/**
 * Grey Email Parsing Service
 *
 * Parses incoming bank transfer notification emails from Grey to extract
 * payment details (amount, currency, reference, sender).
 *
 * Supports both Brevo Inbound Parse and raw email text formats.
 *
 * Security:
 * - All input is sanitized via DOMPurify to prevent injection
 * - Output fields are length-limited and character-restricted
 * - Confidence scoring helps decide auto-process vs manual review
 */
class GreyEmailService {
  /**
   * Parse a Brevo Inbound Parse payload.
   *
   * Brevo sends inbound emails as JSON with this structure:
   * {
   *   "Items": [{
   *     "Uuid": ["..."],
   *     "Subject": "Payment received - $100.00",
   *     "RawHtmlBody": "<html>...",
   *     "RawTextBody": "...",
   *     "Sender": { "Address": "...", "Name": "..." },
   *     ...
   *   }]
   * }
   *
   * @param {Object} brevoPayload - The raw Brevo inbound parse payload
   * @returns {Object} Parsed payment data
   */
  static parseBrevoPayload(brevoPayload) {
    if (!brevoPayload) {
      logger.error("[GreyEmailService] Empty Brevo payload");
      return this._emptyResult("Empty payload");
    }

    // Brevo inbound parse wraps emails in an Items array
    const items = brevoPayload.Items || brevoPayload.items || [];
    const email = items[0] || brevoPayload;

    // Extract text content (prefer plain text over HTML)
    const subject = email.Subject || email.subject || "";
    const textBody =
      email.RawTextBody ||
      email.rawTextBody ||
      email.text ||
      email.plain ||
      "";
    const htmlBody =
      email.RawHtmlBody || email.rawHtmlBody || email.html || "";

    // Combine subject + body for parsing (subject often contains key info)
    const fullText = `${subject}\n${textBody || this._htmlToText(htmlBody)}`;

    const result = this.parse(fullText);

    // Also try to extract sender from Brevo's structured fields
    const sender = email.Sender || email.sender || {};
    if (sender.Name && result.sender === "Unknown Sender") {
      result.sender = this._sanitizeField(sender.Name, 100);
    }

    // Extract Brevo message ID for idempotency
    const uuids = email.Uuid || email.uuid || [];
    if (uuids.length > 0 && !result.transactionId) {
      result.brevoMessageId = uuids[0];
    }

    return result;
  }

  /**
   * Parse raw email text from Grey to extract transaction data.
   * Hardened with DOMPurify and robust regex batteries.
   *
   * @param {string} emailBody - Raw email text or HTML
   * @returns {Object} Parsed payment data with confidence score
   */
  static parse(emailBody) {
    if (!emailBody || typeof emailBody !== "string") {
      return this._emptyResult("No email body provided");
    }

    // 1. Sanitize to prevent HTML/XSS injection
    const cleanHtml = DOMPurify.sanitize(emailBody);
    const text = cleanHtml
      .replace(/<[^>]*>?/gm, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    logger.info(
      `[GreyEmailService] Parsing email: ${text.substring(0, 120)}...`
    );

    let confidence = 0;

    // 2. Amount Extraction (ordered by specificity)
    const amountPatterns = [
      // Grey-specific patterns
      /(?:received|credited|deposited)\s+(?:\$|£|€|NGN|USD|GBP|EUR)?\s*([\d,]+(?:\.\d{1,2})?)/i,
      /(?:amount|total)\s*(?::|of|is)?\s*(?:\$|£|€|NGN)?\s*([\d,]+(?:\.\d{1,2})?)/i,
      // Currency-symbol formats
      /(?:\$|£|€)\s*([\d,]+(?:\.\d{1,2})?)/,
      // Currency-code formats
      /([\d,]+(?:\.\d{1,2})?)\s*(?:USD|GBP|EUR|NGN)\b/i,
      // Generic large number in financial context
      /(?:transfer|payment|deposit)\s+(?:of\s+)?(?:\$|£|€|NGN)?\s*([\d,]+(?:\.\d{1,2})?)/i,
    ];

    let amount = null;
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        const parsed = parseFloat(match[1].replace(/,/g, ""));
        if (parsed > 0 && parsed < 10000000) {
          // Sane limit: $10M
          amount = parsed;
          confidence += 30;
          break;
        }
      }
    }

    // 3. Currency Extraction (ordered by specificity)
    let currency = null;
    const currencyPatterns = [
      { pattern: /\bNGN\b|₦/i, code: "NGN" },
      { pattern: /\bUSD\b|\$(?!\s*\d{4})/i, code: "USD" },
      { pattern: /\bGBP\b|£/i, code: "GBP" },
      { pattern: /\bEUR\b|€/i, code: "EUR" },
    ];

    for (const { pattern, code } of currencyPatterns) {
      if (pattern.test(text)) {
        currency = code;
        confidence += 10;
        break;
      }
    }

    if (!currency) currency = "USD"; // Default fallback

    // 4. Reference Extraction (critical for matching)
    const refPatterns = [
      // Our internal NOTE- format (highest priority)
      /(NOTE-[A-Z0-9]{6,12})/i,
      // Our legacy NS- format
      /(NS-[A-Z0-9]+-\d+)/i,
      // Our internal tx_ format
      /(tx_[a-fA-F0-9]{20,40})/i,
      // Generic narration/memo/reference with value
      /(?:narration|memo|reference|description|remark|remark|ref)\s*[:-]?\s*([A-Za-z0-9_-]{6,40})/i,
      // Reference ID pattern
      /(?:reference\s+id|ref\s*no|ref\s*#)\s*[:-]?\s*([A-Za-z0-9_-]+)/i,
    ];

    let reference = null;
    for (const pattern of refPatterns) {
      const match = text.match(pattern);
      if (match) {
        reference = match[1].trim();
        confidence += 40; // Reference is the most important field
        break;
      }
    }

    // 5. Sender Extraction
    const senderPatterns = [
      /(?:sender|from|payer|originator)\s*[:-]?\s*([^,.\n\r]{3,60}?)(?:\s+(?:at|on|via|sent)|\.|,|$)/i,
      /(?:received|transfer)\s+from\s+([^,.\n\r]{3,60}?)(?:\s+(?:at|on|via)|\.|,|$)/i,
      /(?:account\s+name|name)\s*[:-]?\s*([^,.\n\r]{3,60}?)(?:\s+(?:at|on)|\.|,|$)/i,
    ];

    let sender = "Unknown Sender";
    for (const pattern of senderPatterns) {
      const match = text.match(pattern);
      if (match && match[1].trim().length > 2) {
        sender = match[1].trim();
        confidence += 10;
        break;
      }
    }

    // 6. Transaction ID (provider's unique ID, used as idempotency key)
    const txIdPatterns = [
      /(?:transaction|transfer|payment)\s*(?:id|no|number|ref)\s*[:-]?\s*([A-Za-z0-9_-]{6,40})/i,
      /(?:trace|confirmation)\s*(?:no|number|id)\s*[:-]?\s*([A-Za-z0-9_-]+)/i,
      /(?:session\s+id|trx\s+id)\s*[:-]?\s*([A-Za-z0-9_-]+)/i,
    ];

    let transactionId = null;
    for (const pattern of txIdPatterns) {
      const match = text.match(pattern);
      if (match) {
        transactionId = match[1];
        confidence += 10;
        break;
      }
    }

    // 7. Compute final confidence (0-100)
    confidence = Math.min(confidence, 100);

    // If no amount or no reference, this is low confidence
    if (!amount) confidence = Math.min(confidence, 20);
    if (!reference) confidence = Math.min(confidence, 40);

    // 8. Security: Sanitize all output fields
    return {
      amount,
      currency,
      reference: this._sanitizeField(reference, 64),
      sender: this._sanitizeField(sender, 100),
      transactionId: this._sanitizeField(transactionId, 64),
      confidence,
      status: confidence >= 60 ? "completed" : "needs_review",
      raw: text.substring(0, 2000), // Keep limited raw text for admin review
    };
  }

  /**
   * Generate a unique, user-friendly payment reference.
   * Format: NOTE-XXXXXX (6 uppercase alphanumeric characters)
   *
   * @returns {string} e.g. "NOTE-A3B7K2"
   */
  static generateReference() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Excluding I, O, 0, 1 for readability
    let code = "";
    const randomBytes = require("crypto").randomBytes(6);
    for (let i = 0; i < 6; i++) {
      code += chars[randomBytes[i] % chars.length];
    }
    return `NOTE-${code}`;
  }

  // ─── Private Helpers ──────────────────────────────────────────

  /**
   * Sanitize a field: strip dangerous chars, enforce max length
   * @param {string|null} field
   * @param {number} maxLen
   * @returns {string|null}
   */
  static _sanitizeField(field, maxLen = 255) {
    if (!field) return null;
    return String(field)
      .substring(0, maxLen)
      .replace(/[^\w\s-@.]/gi, "")
      .trim();
  }

  /**
   * Convert HTML to plain text (lightweight)
   * @param {string} html
   * @returns {string}
   */
  static _htmlToText(html) {
    if (!html) return "";
    const clean = DOMPurify.sanitize(html);
    return clean
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(p|div|h\d|li|tr)[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();
  }

  /**
   * Return an empty result object
   * @param {string} reason
   * @returns {Object}
   */
  static _emptyResult(reason) {
    return {
      amount: null,
      currency: null,
      reference: null,
      sender: "Unknown Sender",
      transactionId: null,
      confidence: 0,
      status: "needs_review",
      raw: reason,
    };
  }
}

module.exports = GreyEmailService;
