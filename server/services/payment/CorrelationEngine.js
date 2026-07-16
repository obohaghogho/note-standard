const supabase = require('../../config/database');
const logger = require('../../utils/logger');

/**
 * Correlation Engine
 * Links fragmented events (failed parses, ambiguous matches, delayed arrivals)
 * into a single deterministic transaction timeline.
 */
class CorrelationEngine {
    
    /**
     * Attempts to find a matching transaction record for a given fingerprint or reference.
     * @param {string} fingerprintHash - Triple-ID fingerprint
     * @param {string} reference - Normalized reference 
     */
    static async findCorrelatedTransaction(fingerprintHash, reference) {
        try {
            // 1. Try to find by fingerprint (Most accurate for late arrivals)
            const { data: byFingerprint } = await supabase
                .from('webhook_events')
                .select('id, created_at')
                .eq('fingerprint_hash', fingerprintHash)
                .order('created_at', { ascending: true })
                .limit(1)
                .single();

            if (byFingerprint) {
                // If we found a webhook event, check if it's already linked to a transaction
                const { data: tx } = await supabase
                    .from('transactions')
                    .select('*')
                    .or(`metadata->>fingerprint_hash.eq.${fingerprintHash},reference_id.eq.${reference}`)
                    .limit(1)
                    .single();
                
                return tx || null;
            }

            return null;
        } catch (err) {
            logger.error("[CorrelationEngine] Search failed", err);
            return null;
        }
    }

    /**
     * Scans the reconciliation_queue for other items that share the same fingerprint.
     * Useful for merging "failed_parse" items into a matched identity once a valid email arrives.
     */
    static async linkReconciliationItems(targetReference, fingerprintHash) {
        try {
            const { data: items } = await supabase
                .from('reconciliation_queue')
                .select('id, queue_type, status')
                .eq('status', 'pending')
                .or(`payment_reference.eq.${targetReference},parsed_data->>fingerprint_hash.eq.${fingerprintHash}`);

            if (items && items.length > 0) {
                logger.info(`[CorrelationEngine] Found ${items.length} related items across queues for ${targetReference}. Merging...`);
                
                // Mark them as 'resolved' via correlation
                await supabase.from('reconciliation_queue').update({
                    status: 'auto_recovered',
                    resolution_note: `Correlation Engine linked this to successfully matched transaction: ${targetReference}`
                }).in('id', items.map(i => i.id));
                
                return items.length;
            }
            return 0;
        } catch (err) {
            logger.error("[CorrelationEngine] Linking failed", err);
            return 0;
        }
    }
}

module.exports = CorrelationEngine;
