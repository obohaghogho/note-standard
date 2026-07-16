const BaseParser = require('./BaseParser');

/**
 * Parses UK banking formats (Faster Payments / CHAPS / BACS)
 */
class UkBankParser extends BaseParser {
    static get REGION() { return 'UK'; }

    static parse(text) {
        let confidence = 0;
        let amount, currency, reference;
        let sender = "Unknown Sender";

        // UK Specific patterns (Faster Payments, Sort Code mentions)
        if (/Faster Payment|CHAPS|BACS/i.test(text)) confidence += 15;
        if (/(?:Sort Code|Account Number)/i.test(text)) confidence += 10;

        // Amount: UK specific mostly GBP
        const amtMatch = text.match(/(?:£|GBP)\s*([\d,]+(?:\.\d{1,2})?)/i);
        if (amtMatch) {
            amount = parseFloat(amtMatch[1].replace(/,/g, ''));
            currency = 'GBP';
            confidence += 30;
        }

        // Reference: UK banks often use 'Payment Reference:'
        // Strictly validate format (e.g., must start with NOTE- or be a clean 8-12 char string)
        const refMatch = text.match(/(?:Payment Reference|Reference)\s*[:-]?\s*(NOTE-[A-Z0-9]{5,20}|[A-Z0-9]{8,15})\b/i);
        if (refMatch) {
            reference = refMatch[1].trim();
            confidence += 45; // Boost confidence for well-formatted reference
        } else {
            // Reject ambiguous partial matches
            confidence -= 10;
        }

        // Sender: UK banks often format "From: <Name> / <Sort Code>"
        const senderMatch = text.match(/(?:From|Sender|Account Name)\s*[:-]?\s*([^,.\n\r]{3,60}?)(?:\/|Sort Code|\n|$)/i);
        if (senderMatch) {
            sender = senderMatch[1].trim();
            confidence += 10;
        }

        return this.buildResult(amount, currency, reference, sender, confidence);
    }
}

module.exports = UkBankParser;
