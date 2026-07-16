const supabase = require('../config/database');
const logger = require('../utils/logger');

/**
 * Admin Service (Bank-Grade Governance)
 * Handles multi-sig approvals, SAFE_MODE overrides, and cryptographic governance.
 */
class AdminService {
    
    /**
     * Record a multi-sig approval for a sensitive action.
     * @param {string} adminId - UUID of the approving admin
     * @param {string} entityId - UUID of the entity (e.g. payout_request id)
     * @param {string} type - 'payout_override', 'ledger_correction', etc.
     */
    async recordApproval(adminId, entityId, type = 'SAFE_MODE_OVERRIDE') {
        const { data, error } = await supabase
            .from('admin_approvals')
            .insert({
                entity_type: type,
                entity_id: entityId,
                admin_id: adminId
            })
            .select()
            .single();

        if (error) {
            if (error.code === '23505') throw new Error('You have already approved this action.');
            throw error;
        }

        logger.info(`[AdminService] Approval recorded by admin ${adminId} for entity ${entityId}`);
        return data;
    }

    /**
     * Check if an action has reached the multi-sig threshold.
     * @param {string} entityId 
     * @param {number} threshold - Min required unique approvals (Default: 2)
     */
    async isApproved(entityId, threshold = 2) {
        const { data, count, error } = await supabase
            .from('admin_approvals')
            .select('*', { count: 'exact' })
            .eq('entity_id', entityId);

        if (error) throw error;
        
        const hasMetThreshold = (count >= threshold);
        return {
            isApproved: hasMetThreshold,
            currentApprovals: count,
            requiredApprovals: threshold,
            approverIds: data.map(a => a.admin_id)
        };
    }

    /**
     * Execute a Multi-Sig Override (e.g. Finalize a stuck payout)
     */
    async executePayoutOverride(adminId, payoutId) {
        const payoutService = require('./payment/payoutService');
        
        // 1. Record the initiating admin's approval
        await this.recordApproval(adminId, payoutId);

        // 2. Check if we have enough approvals (Multi-Sig requirement)
        const check = await this.isApproved(payoutId, 2);
        
        if (!check.isApproved) {
            return {
                status: 'pending_approval',
                message: `Approval recorded. Requires ${check.requiredApprovals - check.currentApprovals} more admin signature(s) to execute.`,
                currentApprovals: check.currentApprovals
            };
        }

        // 3. Logic: Multi-sig threshold met -> Execute the override
        // Transition to SETTLED (Manual Override)
        await payoutService.updatePayoutState(payoutId, 'SETTLED', null, { 
            override: true, 
            approvers: check.approverIds,
            reason: 'Multi-sig Admin Override'
        });

        logger.warn(`[AdminService] MULTI-SIG OVERRIDE EXECUTED for payout ${payoutId} by admins ${check.approverIds.join(', ')}`);
        
        return {
            status: 'executed',
            message: 'Multi-sig threshold met. Payout advanced to SETTLED.'
        };
    }
}

module.exports = new AdminService();
