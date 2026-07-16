const BaseParser = require('./BaseParser');

/**
 * Parses International SWIFT format messages (MT103)
 */
class SwiftParser extends BaseParser {
    static get REGION() { return 'INTERNATIONAL_SWIFT'; }

    static parse(text) {
        let confidence = 0;
        let amount, currency, reference;
        let sender = "Unknown Sender";

        if (/SWIFT|MT103|BIC|IBAN|International Transfer/i.test(text)) confidence += 15;

        // MT103 block 32A style or general SWIFT amounts
        const amtMatch = text.match(/(?:Value|Amount|32A:)\s*(?:USD|EUR|GBP)?\s*([\d,]+(?:\.\d{1,2})?)/i);
        if (amtMatch) {
            amount = parseFloat(amtMatch[1].replace(/,/g, ''));
            // Try to extract currency nearby
            const currMatch = text.match(/\b(USD|EUR|GBP|AUD|CAD|JPY|SGD)\b/i);
            currency = currMatch ? currMatch[1].toUpperCase() : 'USD';
            confidence += 30;
        }

        // SWIFT field 70 or general references
        const refMatch = text.match(/(?:70:|Remittance Information|Reference)\s*[:-]?\s*([A-Za-z0-9_-]{6,40})/i);
        if (refMatch) {
            reference = refMatch[1].trim();
            confidence += 40;
        }

        // SWIFT field 50 or Sender
        const senderMatch = text.match(/(?:50:|Ordering Customer|Sender)\s*[:-]?\s*([^,.\n\r]{3,60}?)(?:\n|50K:|$)/i);
        if (senderMatch) {
            sender = senderMatch[1].trim();
            confidence += 10;
        }

        return this.buildResult(amount, currency, reference, sender, confidence);
    }
}

module.exports = SwiftParser;
