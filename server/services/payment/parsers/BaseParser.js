const { JSDOM } = require("jsdom");
const createDOMPurify = require("dompurify");
const window = new JSDOM("").window;
const DOMPurify = createDOMPurify(window);

/**
 * Base Parser for regional transaction normalizations
 */
class BaseParser {
    static get REGION() { return 'UNKNOWN'; }

    static sanitizeField(field, maxLen = 255) {
        if (!field) return null;
        return String(field)
            .substring(0, maxLen)
            .replace(/[^\w\s-@.]/gi, "")
            .trim();
    }

    static htmlToText(html) {
        if (!html) return "";
        const clean = DOMPurify.sanitize(html);
        return clean
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/?(p|div|h\d|li|tr)[^>]*>/gi, "\n")
            .replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/gi, " ")
            .replace(/\s+/g, " ")
            .trim();
    }

    static normalizeWhitespace(text) {
        if (!text) return "";
        return text
            .replace(/\s+/g, " ") // Collapse all space-like characters
            .trim();
    }

    static buildResult(amount, currency, reference, sender, confidence) {
        return {
            normalized_amount: Number(amount) || null,
            normalized_currency: currency || null,
            normalized_reference: reference ? this.sanitizeField(reference, 64) : null,
            sender_fingerprint: sender ? this.sanitizeField(sender, 100) : "Unknown Sender",
            provider_region: this.REGION,
            confidence_score: Math.min(confidence, 100)
        };
    }
}

module.exports = BaseParser;
