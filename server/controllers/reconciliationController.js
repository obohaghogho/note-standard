const supabase = require('../config/database');
const governanceManager = require('../services/GovernanceManager');
const settlementEngine = require('../services/SettlementEngine');
const decisionEngine = require('../services/DecisionEngine');
const logger = require('../utils/logger');

/**
 * Reconciliation Controller (Phase 7 - Governance Observability)
 * Provides admin visibility and manual override authority for time-locked proposals.
 */
class ReconciliationController {
    /**
     * Fetch all reconciliation proposals with pagination and filters.
     */
    async getProposals(req, res) {
        try {
            const { status } = req.query;

            let query = supabase
                .from('reconciliation_proposals')
                .select(`
                    id,
                    wallet_id,
                    asset,
                    currency,
                    drift_amount,
                    direction,
                    status,
                    severity,
                    settlement_epoch_id,
                    eligible_at,
                    expires_at,
                    applied_at,
                    created_at,
                    wallets_store!inner(address)
                `)
                .order('created_at', { ascending: false })
                .limit(100);

            if (status) {
                query = query.eq('status', status);
            }

            const { data, error } = await query;

            if (error) throw error;

            res.json({ success: true, proposals: data });
        } catch (error) {
            logger.error(`[ReconciliationController] Failed to fetch proposals: ${error.message}`);
            res.status(500).json({ success: false, error: 'Internal Server Error' });
        }
    }

    /**
     * Manually invalidate a proposal (e.g. False Positive)
     */
    async invalidateProposal(req, res) {
        try {
            const { id } = req.params;
            const { reason } = req.body;
            const adminId = req.user.id;

            const { data: proposal, error: fetchErr } = await supabase
                .from('reconciliation_proposals')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchErr || !proposal) return res.status(404).json({ success: false, error: 'Proposal not found' });
            if (proposal.status !== 'AUDITING') return res.status(400).json({ success: false, error: `Cannot invalidate proposal in ${proposal.status} state` });

            const { error: updateErr } = await supabase
                .from('reconciliation_proposals')
                .update({ 
                    status: 'INVALIDATED',
                    metadata: { 
                        ...proposal.metadata, 
                        invalidated_by: adminId, 
                        invalidation_reason: reason || 'Manual Admin Cancellation',
                        invalidated_at: new Date().toISOString()
                    }
                })
                .eq('id', id);

            if (updateErr) throw updateErr;

            logger.info(`[ReconciliationController] Proposal ${id} manually invalidated by Admin ${adminId}`);
            res.json({ success: true, message: 'Proposal invalidated safely.' });

        } catch (error) {
            logger.error(`[ReconciliationController] Failed to invalidate proposal: ${error.message}`);
            res.status(500).json({ success: false, error: 'Internal Server Error' });
        }
    }

    /**
     * Force Approval of HIGH drift proposal
     * Bypasses the 0.1% auto-apply limit but still enforces strict monotonic and temporal guards.
     */
    async approveHighDriftProposal(req, res) {
        try {
            const { id } = req.params;
            const adminId = req.user.id;

            // 1. Fetch
            const { data: proposal, error: fetchErr } = await supabase
                .from('reconciliation_proposals')
                .select('*')
                .eq('id', id)
                .single();

            if (fetchErr || !proposal) return res.status(404).json({ success: false, error: 'Proposal not found' });
            if (proposal.status !== 'AUDITING') return res.status(400).json({ success: false, error: `Cannot approve proposal in ${proposal.status} state` });
            if (proposal.severity !== 'HIGH' && proposal.severity !== 'MEDIUM') return res.status(400).json({ success: false, error: `Auto-apply handles LOW drift. This endpoint is for HIGH/MEDIUM drift.` });

            // 2. Fetch Latest Context
            const { data: wallet } = await supabase
                .from('wallets_v6')
                .select('balance, epoch_id')
                .eq('id', proposal.wallet_id)
                .single();

            const systemState = { state: 'ALLOWED', reason: 'CONSENSUS_STABLE' };

            // 3. Revalidate Context (Governance Layer Auth)
            const validation = await governanceManager.validateProposal(
                proposal, 
                proposal.drift_amount, 
                wallet.epoch_id, 
                systemState
            );

            if (!validation.valid) {
                // Instantly invalidate if the environment changed (e.g. Epoch advanced)
                await supabase.from('reconciliation_proposals')
                    .update({ status: 'INVALIDATED', metadata: { reason: `Pre-Approval Validation failed: ${validation.reason}` } })
                    .eq('id', proposal.id);
                
                return res.status(400).json({ success: false, error: `Proposal no longer valid: ${validation.reason}` });
            }

            // 4. Atomic Execution via SettlementEngine
            const now = new Date().toISOString();
            
            await settlementEngine.processEvent({
                transactionId: proposal.id, 
                status: 'LEDGER_COMMITTED',
                providerId: 'SYSTEM_GOVERNANCE', // Immutable source
                payload: { 
                    drift: proposal.drift_amount, 
                    approved_by: adminId, 
                    approval_type: 'MANUAL_HIGH_DRIFT' 
                },
                eventAt: now
            });

            // 5. Update Status
            await supabase
                .from('reconciliation_proposals')
                .update({ status: 'APPLIED', applied_at: now, metadata: { ...proposal.metadata, approved_by: adminId } })
                .eq('id', proposal.id);

            logger.info(`[ReconciliationController] HIGH Drift Proposal ${proposal.id} manually applied by Admin ${adminId}`);
            res.json({ success: true, message: 'Institutional correction applied securely.' });

        } catch (error) {
            logger.error(`[ReconciliationController] Failed to force approve proposal: ${error.message}`);
            res.status(500).json({ success: false, error: error.message || 'Internal Server Error' });
        }
    }
}

module.exports = new ReconciliationController();
