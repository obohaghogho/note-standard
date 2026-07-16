const crypto = require("crypto");
const logger = require("../../utils/logger");

/**
 * Chaos Kernel (DFOS v6.0 Phase 4)
 * Deterministic Adversarial Failure Injector.
 */
class ChaosKernel {
    constructor() {
        this.DESYNC_TIERS = {
            MICRO: { min: 100, max: 500 },     // Normal jitter
            MESO: { min: 500, max: 3000 },    // Real-world lag
            MACRO: { min: 3000, max: 15000 },  // Degraded provider
            EXTREME: { min: 15000, max: 60000 } // Adversarial/Failure
        };
    }

    /**
     * Generates a deterministic shadow result set for a given scenario.
     * @param {string} scenarioId - Replay anchor
     * @param {string} seed - Input seed
     * @param {Object} baseRates - Reference ground truth (CG PRICES)
     */
    generateDeterministicInjections(scenarioId, seed, baseRates) {
        const hash = crypto.createHash("sha256").update(`${scenarioId}:${seed}`).digest("hex");
        
        const symbols = Object.keys(baseRates);
        const cgPrices = { ...baseRates };
        const nowRates = symbols.map(s => baseRates[s]); // Ground truth initial
        
        // 1. Inject Price Drift (controlled bps)
        const driftBps = parseInt(hash.substring(0, 4), 16) % 300; // Max 3% drift
        symbols.forEach((sym, idx) => {
            if (idx % 2 === 0) { // Distribute drift non-uniformly
                nowRates[idx] *= (1 + (driftBps / 10000));
            }
        });

        // 2. Inject Latency & Desync (Tiered)
        const desyncHash = parseInt(hash.substring(4, 8), 16) % 100;
        let desyncTier = 'MICRO';
        if (desyncHash > 90) desyncTier = 'EXTREME';
        else if (desyncHash > 75) desyncTier = 'MACRO';
        else if (desyncHash > 50) desyncTier = 'MESO';

        const tierRange = this.DESYNC_TIERS[desyncTier];
        const injectedDesync = tierRange.min + (parseInt(hash.substring(8, 12), 16) % (tierRange.max - tierRange.min));

        return {
            symbols,
            cgPrices,
            nowRates, // Mocked NOWPayments response (drifted)
            erpRates: 1500 + (parseInt(hash.substring(12, 16), 16) % 50), // Mocked NGN rate
            meta: {
                scenarioId,
                seed,
                desyncTier,
                injectedDesyncMs: injectedDesync,
                driftBps,
                timestamp: Date.now()
            }
        };
    }

    /**
     * Reality Anchor Constraint (User Phase 4 Invariant)
     * Ensures injections do not violate market continuity sanity.
     */
    enforceRealityAnchor(results) {
        // Implementation rule: Max drift across quorum cannot exceed 20% in a single tick
        for (const [sym, price] of Object.entries(results.cgPrices)) {
            const drifted = results.nowRates[results.symbols.indexOf(sym)];
            if (drifted && Math.abs(drifted - price) / price > 0.20) {
                logger.error(`[ChaosKernel] Reality Anchor Violation: ${sym} drift > 20%. Scaling back for sanity.`);
                results.nowRates[results.symbols.indexOf(sym)] = price * 1.15; // Cap at 15%
            }
        }
        return results;
    }
}

module.exports = new ChaosKernel();
