const logger = require('../../utils/logger');

/**
 * Compensation Policy (Risk Governance)
 * Defined by Value Tiers and Economic Liability.
 */
class CompensationPolicy {
    constructor() {
        this.TIERS = {
            SAFE: { 
                max_value: 50, 
                cooldown_minutes: 0, 
                requires_manual: false,
                label: 'Autonomous Immediate'
            },
            CONTROLLED: { 
                max_value: 500, 
                cooldown_minutes: 30, 
                requires_manual: false,
                label: 'Autonomous Delayed'
            },
            HARD: { 
                max_value: Infinity, 
                cooldown_minutes: -1, 
                requires_manual: true,
                label: 'Manual Multi-Sig Required'
            }
        };
    }

    /**
     * Determine the risk class for an intent based on amount.
     */
    getRiskClass(amount) {
        const val = Number(amount);
        if (val < this.TIERS.SAFE.max_value) return 'SAFE';
        if (val < this.TIERS.CONTROLLED.max_value) return 'CONTROLLED';
        return 'HARD';
    }

    /**
     * Get the cooldown window for a specific risk class.
     */
    getCooldownMinutes(riskClass) {
        return this.TIERS[riskClass]?.cooldown_minutes || 0;
    }

    /**
     * Checks if a reversal requires human intervention.
     */
    requiresManualApproval(riskClass) {
        return this.TIERS[riskClass]?.requires_manual || false;
    }

    /**
     * Maps an internal intent class to a dynamic SLA envelope (latency abstraction).
     */
    getSLAEnvelopes(intentType) {
        const envelopes = {
            'ledger_mutation': { delayed: 300, attention: 900 }, // 5m / 15m
            'payout_transfer': { delayed: 1800, attention: 7200 }, // 30m / 2h
            'commission_split': { delayed: 600, attention: 1800 } // 10m / 30m
        };

        return envelopes[intentType] || { delayed: 300, attention: 900 };
    }
}

module.exports = new CompensationPolicy();
