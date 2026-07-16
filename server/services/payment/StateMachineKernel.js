const logger = require('../../utils/logger');

/**
 * State Machine Kernel (Formal FSM)
 * Shared logic for validating financial transitions across both Application and DB.
 */
class StateMachineKernel {
    constructor() {
        this.payoutTransitions = {
            'REQUESTED': ['VALIDATING', 'FAILED'],
            'VALIDATING': ['RESERVED', 'FAILED'],
            'RESERVED': ['APPROVED', 'REVERSED'],
            'APPROVED': ['PROCESSING', 'FAILED'],
            'PROCESSING': ['SENT', 'FAILED'],
            'SENT': ['SETTLED', 'REVERSED'],
            'SETTLED': ['COMPLETED'],
            'COMPLETED': [], // Terminal
            'FAILED': ['RESERVED'], // Recovery allowed in some cases
            'REVERSED': [] // Terminal
        };
    }

    /**
     * Validate a transition attempt.
     * Throws if the transition violates the formal graph.
     */
    validateTransition(entityType, from, to) {
        if (entityType === 'payout_request') {
            const allowed = this.payoutTransitions[from];
            if (!allowed || !allowed.includes(to)) {
                throw new Error(`FSM Violation: Cannot move ${entityType} from ${from} to ${to}.`);
            }
        }
        
        // Add more entity types (e.g. wallet states) here
        return true;
    }

    /**
     * Dual-Layer Proof: Check if the attempt is valid for both App and DB logic.
     */
    async verifyIntent(intent) {
        const { entityId, entityType, fromState, toState } = intent;
        
        logger.debug(`[StateMachineKernel] Verifying intent ${entityType}:${entityId} (${fromState} -> ${toState})`);
        
        try {
            this.validateTransition(entityType, fromState, toState);
            return { valid: true };
        } catch (err) {
            return { valid: false, reason: err.message };
        }
    }
}

module.exports = new StateMachineKernel();
