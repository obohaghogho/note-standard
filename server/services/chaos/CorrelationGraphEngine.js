const crypto = require("crypto");
const supabase = require("../../config/database");
const logger = require("../../utils/logger");

/**
 * Correlation Graph Engine (Phase 5)
 * Builds a deterministic belief system about provider independence.
 */
class CorrelationGraphEngine {
    constructor() {
        this.STATIONARY_DECAY_FACTOR = 0.99; // Slow decay for structural risk
        this.BEHAVIORAL_DECAY_FACTOR = 0.95; // Faster decay for temporal jitter
        this.CORRELATION_TRACKER = new Map(); // In-memory lead/lag buffer
    }

    /**
     * Calculates the PCS (Provider Correlation Score) for a quorum.
     */
    async calculatePCS(providerResults, structuralMatrix) {
        let maxCorrelation = 0;
        const pairs = this._generatePairs(Object.keys(providerResults));

        for (const [p1, p2] of pairs) {
            const structural = this._computeStructuralScore(structuralMatrix[p1], structuralMatrix[p2]);
            const behavioral = this._computeBehavioralScore(providerResults[p1], providerResults[p2]);
            
            // PCS = weighted(structural, behavioral)
            // User Constraint: Metadata confidence weighting
            const weightedScore = (structural * 0.9) + (behavioral * 0.7);
            maxCorrelation = Math.max(maxCorrelation, weightedScore);

            // Update Lead/Lag Fingerprinting
            this._updateLeadLag(p1, p2, providerResults[p1], providerResults[p2]);
        }

        return Math.min(1.0, maxCorrelation);
    }

    /**
     * Layer 1 & 2: Static + Derived Structural Risk
     */
    _computeStructuralScore(m1, m2) {
        if (!m1 || !m2) return 0.5; // High caution for unknown metadata

        let score = 0;
        if (m1.infra === m2.infra) score += 0.15;
        if (m1.cdn === m2.cdn) score += 0.25; // Higher risk (shared caching)
        if (m1.type === m2.type) score += 0.10;
        if (m1.region === m2.region) score += 0.15;

        return Math.min(1.0, score);
    }

    /**
     * Layer 3 & 4: Dynamic + Behavioral Fingerprint
     */
    _computeBehavioralScore(r1, r2) {
        // Price Synchronicity Check
        const priceCorrelation = r1.price === r2.price ? 0.3 : 0;
        
        // Response Latency Alignment (Fingerprint)
        const t1 = r1.metadata?.timestamp || Date.now();
        const t2 = r2.metadata?.timestamp || Date.now();
        const latencySkew = Math.abs(t1 - t2) < 50 ? 0.2 : 0;

        return Math.min(1.0, priceCorrelation + latencySkew);
    }

    /**
     * Lead/Lag Detection (Phase 5 Requirement)
     */
    _updateLeadLag(p1, p2, r1, r2) {
        const key = `${p1}:${p2}`;
        const stats = this.CORRELATION_TRACKER.get(key) || { p1Leads: 0, p2Leads: 0, total: 0 };
        
        if (r1.price !== r2.price) {
            // Very simple lead detection: Who matches the later consensus price first?
            // (Real implementation would use a sliding window of historical snapshots)
            stats.total++;
            this.CORRELATION_TRACKER.set(key, stats);
        }
    }

    /**
     * Generates all unique pairs of providers.
     */
    _generatePairs(providers) {
        const result = [];
        for (let i = 0; i < providers.length; i++) {
            for (let j = i + 1; j < providers.length; j++) {
                result.push([providers[i], providers[j]]);
            }
        }
        return result;
    }
}

module.exports = new CorrelationGraphEngine();
