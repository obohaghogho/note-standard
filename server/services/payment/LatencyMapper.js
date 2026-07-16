/**
 * Latency Mapper (UX Abstraction)
 * Maps internal causal engine states to user-friendly latency semantics.
 * Ensures the causal graph complexity is not leaked to the end user.
 */
class LatencyMapper {
    /**
     * Map internal intent status to User UI Status.
     * @param {string} internalStatus - pending, locked, completed, failed
     * @param {string} slaStatus - PENDING, STALLED, ORPHANED
     */
    mapStatus(internalStatus, slaStatus = 'PENDING') {
        if (internalStatus === 'completed') return 'Successful';
        if (internalStatus === 'failed') return 'Failed';

        // Latency Tiers
        switch (slaStatus) {
            case 'PENDING':
                return 'Processing';
            case 'STALLED':
                return 'Delayed Processing'; // User knows it's coming but taking longer
            case 'ORPHANED':
                return 'Requires Attention'; // Something is actually wrong
            default:
                return 'Processing';
        }
    }

    /**
     * Get user-friendly explanation based on the latency tier.
     */
    getReason(slaStatus) {
        switch (slaStatus) {
            case 'PENDING':
                return 'Your transaction is being verified by our secure nodes.';
            case 'STALLED':
                return 'External network congestion detected. We are retrying your transaction.';
            case 'ORPHANED':
                return 'An unexpected delay occurred. Our support team has been notified for manual resolution.';
            default:
                return null;
        }
    }
}

module.exports = new LatencyMapper();
