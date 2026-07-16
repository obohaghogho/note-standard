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
 * Supports both Brevo Inbound Parse, SendGrid Inbound Parse, and raw email text formats.
 *
 * Security:
 * - All input is sanitized via DOMPurify to prevent injection
 * - Output fields are length-limited and character-restricted
 * - Confidence scoring helps decide auto-process vs manual review
 */
class GreyEmailService {
  /**
   * Parse a SendGrid Inbound Parse payload.
   * SendGrid sends multipart/form-data with fields like:
   * { text, html, subject, from, to, envelope }
   * 
   * @param {Object} body - Parsed form fields from SendGrid
   * @returns {Object} Parsed payment data
   */
  static parseSendGridPayload(body) {
    if (!body) {
      logger.error("[GreyEmailService] Empty SendGrid payload");
      return this._emptyResult("Empty payload");
    }

    const { text, html, subject, from } = body;
    const fullText = `${subject || ""}\n${text || this._htmlToText(html)}`;

    const result = this.parse(fullText);

    // Extract sender from SendGrid's 'from' field if not found in text
    if (from && result.sender === "Unknown Sender") {
      result.sender = this._sanitizeField(from, 100);
    }

    return result;
  }

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
    if (!brevoPayload || !brevoPayload.Items || !brevoPayload.Items[0]) {
      logger.error("[GreyEmailService] Empty or invalid Brevo payload");
      return this._emptyResult("Empty payload");
    }

    const item = brevoPayload.Items[0];
    const fullText = `${item.Subject || ""}\n${item.RawTextBody || this._htmlToText(item.RawHtmlBody)}`;

    const result = this.parse(fullText);

    // Extract sender from Brevo's 'Sender' object if not found in text
    if (item.Sender && result.sender === "Unknown Sender") {
      result.sender = this._sanitizeField(item.Sender.Name || item.Sender.Address, 100);
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
      // Grey-specific patterns (more flexible)
      /(?:received|credited|deposited|transfer)\s+(?:of\s+)?(?:\$|£|€|NGN|USD|GBP|EUR)?\s*([\d,]+(?:\.\d{1,2})?)/i,
      /(?:amount|total)\s*(?::|of|is)?\s*(?:\$|£|€|NGN)?\s*([\d,]+(?:\.\d{1,2})?)/i,
      // Currency-symbol formats
      /(?:\$|£|€)\s*([\d,]+(?:\.\d{1,2})?)/,
      // Currency-code formats
      /([\d,]+(?:\.\d{1,2})?)\s*(?:USD|GBP|EUR|NGN)\b/i,
      // Generic large number in financial context
      /(?:payment|deposit)\s+(?:of\s+)?(?:\$|£|€|NGN)?\s*([\d,]+(?:\.\d{1,2})?)/i,
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
      /(?:sender|from|payer|originator)\s*[:-]?\s*([^,.\n\r]{3,60}?)(?:\s+(?:at|on|via|sent)|\.|,|-|$)/i,
      /(?:received|transfer)\s+from\s+([^,.\n\r]{3,60}?)(?:\s+(?:at|on|via)|\.|,|-|$)/i,
      /(?:account\s+name|name)\s*[:-]?\s*([^,.\n\r]{3,60}?)(?:\s+(?:at|on)|\.|,|-|$)/i,
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
   * Generate a secure, unique, and time-bound payment reference.
   * Format: NOTE-<userIdHash>-<timestampHex>-<cryptoRandom>
   *
   * @param {string} userId - User ID to inject entropy
   * @returns {string} e.g. "NOTE-A3B7-18C8B1A-F4"
   */
  static generateReference(userId = "anonymous") {
    const crypto = require("crypto");
    
    // User Entropy (first 4 chars of sha256 hash)
    const userHash = crypto.createHash('sha256').update(String(userId)).digest('hex').substring(0, 4).toUpperCase();
    
    // Time-bound Component (Hex timestamp)
    const timestampHex = Date.now().toString(16).toUpperCase();
    
    // Cryptographically secure random piece
    const randomHex = crypto.randomBytes(2).toString('hex').toUpperCase();

    return `NOTE-${userHash}-${timestampHex}-${randomHex}`;
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
