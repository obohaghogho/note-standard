const BaseParser = require('./BaseParser');

/**
 * Parses US banking formats (ACH / Wire / RTP)
 */
class UsAchParser extends BaseParser {
    static get REGION() { return 'US'; }

    static parse(text) {
        let confidence = 0;
        let amount, currency, reference;
        let sender = "Unknown Sender";

        if (/ACH|Wire Transfer|RTP|Checking|Routing/i.test(text)) confidence += 15;

        // Amount: US specific mostly USD
        const amtMatch = text.match(/(?:\$|USD)\s*([\d,]+(?:\.\d{1,2})?)/i);
        if (amtMatch) {
            amount = parseFloat(amtMatch[1].replace(/,/g, ''));
            currency = 'USD';
            confidence += 30;
        }

        // Reference: US banks often use 'Memo' or 'Addenda'
        const refMatch = text.match(/(?:Memo|Addenda|Reference)\s*[:-]?\s*([A-Za-z0-9_-]{6,40})/i);
        if (refMatch) {
            reference = refMatch[1].trim();
            confidence += 40;
        }

        const senderMatch = text.match(/(?:Originator|Sender|From)\s*[:-]?\s*([^,.\n\r]{3,60}?)(?:\n|$)/i);
        if (senderMatch) {
            sender = senderMatch[1].trim();
            confidence += 10;
        }

        return this.buildResult(amount, currency, reference, sender, confidence);
    }
}

module.exports = UsAchParser;
