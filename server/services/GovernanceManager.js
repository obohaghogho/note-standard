const supabase = require("../config/database");
const decisionEngine = require("./DecisionEngine");
const logger = require("../utils/logger");
const crypto = require("crypto");

/**
 * Governance Manager (DFOS v6.x)
 * 
 * Enforces the "Propose -> Audit -> Apply" lifecycle for financial corrections.
 * Implements scoped integrity hashes, audit windows, and drift-direction locks.
 */
class GovernanceManager {
    constructor() {
        this.AUDIT_WINDOW_MS = 60 * 60 * 1000; // 1 Hour
        this.LOW_DRIFT_THRESHOLD = 0.001;      // 0.1% for auto-apply eligibility
    }

    /**
     * Step 1: Propose Correction
     * Captures the scoped state and binds it to the current epoch.
     */
    async propose(params) {
        const { walletId, asset, currency, precision, epoch, driftAmount, severity, metadata } = params;

        // 1. Generate Scoped Integrity Hash
        // Scope: (wallet, asset, epoch, precision, drift)
        // If ANY of these change at apply-time, the proposal is invalidated.
        const hash = this.computeScopedHash({ walletId, asset, epoch, precision, driftAmount });

        const now = new Date();
        const eligibleAt = new Date(now.getTime() + this.AUDIT_WINDOW_MS);
        const expiresAt = new Date(eligibleAt.getTime() + (60 * 60 * 1000)); // 1h eligible window

        const direction = Math.sign(driftAmount);

        const { data, error } = await supabase
            .from('reconciliation_proposals')
            .insert([{
                wallet_id: walletId,
                asset,
                currency,
                precision,
                drift_amount: driftAmount,
                direction,
                internal_snapshot_hash: hash,
                settlement_epoch_id: epoch,
                severity,
                status: 'AUDITING',
                eligible_at: eligibleAt.toISOString(),
                expires_at: expiresAt.toISOString(),
                metadata
            }])
            .select()
            .single();

        if (error) {
            logger.error(`[GovernanceManager] Proposal failed: ${error.message}`);
            throw error;
        }

        logger.info(`[GovernanceManager] Proposal ${data.id} created. Eligible at ${eligibleAt.toISOString()}`);
        return data;
    }

    /**
     * Step 2: Validate Implementation (Governance Verifiers)
     * Re-calculates state vs. proposal to ensure conditions are still met.
     */
    async validateProposal(proposal, currentDrift, currentEpoch, systemState) {
        // 1. Monotonic Epoch Check
        if (currentEpoch !== parseInt(proposal.settlement_epoch_id)) {
            return { valid: false, reason: 'EPOCH_ADVANCED' };
        }

        // 2. Direction Lock
        if (Math.sign(currentDrift) !== proposal.direction) {
            return { valid: false, reason: 'DRIFT_DIRECTION_FLIPPED' };
        }

        // 3. Magnitude Check (Drift should not have significantly increased)
        if (Math.abs(currentDrift) > Math.abs(proposal.drift_amount) * 1.05) {
             return { valid: false, reason: 'DRIFT_MAGNITUDE_INCREASED' };
        }

        // 4. Regime Mode Check (DecisionEngine Consensus)
        if (systemState.state !== 'ALLOWED' || systemState.reason !== 'CONSENSUS_STABLE') {
            return { valid: false, reason: `REGIME_NOT_STABLE: ${systemState.reason}` };
        }

        return { valid: true };
    }

    /**
     * Compute SHA-256 for scoped state integrity.
     */
    computeScopedHash(data) {
        const { walletId, asset, epoch, precision, driftAmount } = data;
        const raw = `${walletId}:${asset}:${epoch}:${precision}:${driftAmount.toString()}`;
        return crypto.createHash('sha256').update(raw).digest('hex');
    }

    /**
     * Check Eligibility
     */
    isEligible(proposal) {
        const now = new Date();
        const eligibleAt = new Date(proposal.eligible_at);
        const expiresAt = new Date(proposal.expires_at);

        if (now < eligibleAt) return { eligible: false, reason: 'AUDIT_WINDOW_ACTIVE' };
        if (now > expiresAt) return { eligible: false, reason: 'PROPOSAL_EXPIRED' };
        if (proposal.status !== 'AUDITING') return { eligible: false, reason: `INVALID_STATUS: ${proposal.status}` };

        return { eligible: true };
    }
}

module.exports = new GovernanceManager();
