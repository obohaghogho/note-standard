const BaseParser = require('./parsers/BaseParser');
const UkBankParser = require('./parsers/UkBankParser');
const UsAchParser = require('./parsers/UsAchParser');
const SwiftParser = require('./parsers/SwiftParser');
const GreyEmailService = require('./GreyEmailService'); 
const supabase = require('../../config/database');
const logger = require('../../utils/logger');

/**
 * Universal Parser Engine
 * 
 * Takes an inbound email payload (SendGrid/Brevo/Raw) and iteratively
 * runs it against region-aware parsing heuristic engines (UK, US, SWIFT).
 * Selects the output with the highest confidence score.
 */
class UniversalParserEngine {
    
    /**
     * Parses the payload from SendGrid Inbound Parse
     */
    static async parseSendGridPayload(body) {
        if (!body) return this._emptyResult("Empty payload");
        
        const { text, html, subject } = body;
        const fullText = `${subject || ""}\n${text || BaseParser.htmlToText(html)}`;
        
        return await this.parseIteratively(fullText);
    }

    /**
     * Iteratively evaluates text against all region parsers.
     * @param {string} fullText 
     */
    static async parseIteratively(fullText) {
        if (!fullText) return this._emptyResult("No text provided");

        // Normalize text before regional parsing (Harden whitespace)
        const normalizedText = BaseParser.normalizeWhitespace(fullText);

        // Execute all parsers
        const results = [
            UkBankParser.parse(normalizedText),
            UsAchParser.parse(normalizedText),
            SwiftParser.parse(normalizedText),
            GreyEmailService.parse(normalizedText) // Use classic Grey parser as generic safety net
        ];

        // Sort by highest confidence_score
        // Note: Classic Grey result might have just `confidence` instead of `confidence_score`
        // We normalize it dynamically for comparison
        results.sort((a, b) => {
            const scoreA = a.confidence_score !== undefined ? a.confidence_score : (a.confidence || 0);
            const scoreB = b.confidence_score !== undefined ? b.confidence_score : (b.confidence || 0);
            return scoreB - scoreA;
        });

        const bestMatch = results[0];
        
        // ── Domain Trust Verification (Hardening Level 4) ──
        let trustAdjustment = 0;
        const senderDomain = bestMatch.sender_fingerprint?.split('@')[1] || null;
        
        if (senderDomain) {
            const { data: config } = await supabase
                .from('settlement_configs')
                .select('sender_domain_allowlist')
                .eq('region', bestMatch.provider_region)
                .maybeSingle();

            const isTrusted = config?.sender_domain_allowlist?.includes(senderDomain);
            if (!isTrusted) {
                trustAdjustment = -20; // Confidence penalty for untrusted domains
                logger.warn(`[UniversalParser] Untrusted domain penalty (-20%) applied to ${senderDomain} for region ${bestMatch.provider_region}`);
            }
        }

        const finalScore = Math.max(0, (bestMatch.confidence_score !== undefined ? bestMatch.confidence_score : bestMatch.confidence) + trustAdjustment);

        // Normalize the payload schema so downstream is strictly typed
        return {
            normalized_amount: bestMatch.normalized_amount || bestMatch.amount,
            normalized_currency: bestMatch.normalized_currency || bestMatch.currency,
            normalized_reference: bestMatch.normalized_reference || bestMatch.reference,
            sender_fingerprint: bestMatch.sender_fingerprint || bestMatch.sender,
            provider_region: bestMatch.provider_region || 'GENERIC',
            confidence_score: finalScore,
            raw: fullText.substring(0, 2000)
        };
    }

    static _emptyResult(reason) {
        return {
            normalized_amount: null,
            normalized_currency: null,
            normalized_reference: null,
            sender_fingerprint: "Unknown Sender",
            provider_region: 'UNKNOWN',
            confidence_score: 0,
            raw: reason,
        };
    }
}

module.exports = UniversalParserEngine;
