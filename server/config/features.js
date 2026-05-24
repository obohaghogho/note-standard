/**
 * Feature Flags for Progressive Rollout
 * 
 * Default all major structural systems to FALSE for safety.
 * This guarantees Phase 1 scaffolding doesn't alter production runtime
 * until QA and Staging verifications are complete.
 */

const features = {
    SOCKET_EVENT_VALIDATION: process.env.FF_SOCKET_EVENT_VALIDATION === 'true' || false,
    RECONCILIATION_ENGINE: process.env.FF_RECONCILIATION_ENGINE === 'true' || false,
    CIRCUIT_BREAKER: process.env.FF_CIRCUIT_BREAKER === 'true' || false,
    OFFLINE_RETRY_QUEUE: process.env.FF_OFFLINE_RETRY_QUEUE === 'true' || false,
    STATE_PROTECTION_MIDDLEWARE: process.env.FF_STATE_PROTECTION_MIDDLEWARE === 'true' || false,
    SEQUENCE_ENFORCEMENT: process.env.FF_SEQUENCE_ENFORCEMENT === 'true' || false,
    BACKGROUND_RECOVERY_WORKERS: process.env.FF_BACKGROUND_RECOVERY_WORKERS === 'true' || false,
};

// Parse allowlist and percentage for SEQUENCE_ENFORCEMENT staged rollout
const seqUsersList = process.env.SEQUENCE_ENFORCEMENT_USERS 
    ? process.env.SEQUENCE_ENFORCEMENT_USERS.split(',').map(u => u.trim())
    : [];
const seqPercentage = parseInt(process.env.SEQUENCE_ENFORCEMENT_PERCENTAGE || '0', 10);

const stagedRollouts = {
    SEQUENCE_ENFORCEMENT: {
        allowlist: new Set(seqUsersList),
        percentage: isNaN(seqPercentage) ? 0 : Math.max(0, Math.min(100, seqPercentage))
    }
};

/**
 * Deterministic hash-based percentage bucketing for a user.
 */
function isUserInPercentage(userId, percentage) {
    if (percentage <= 0) return false;
    if (percentage >= 100) return true;
    if (!userId) return false;
    
    // Simple fast string hash for stable bucketing
    let hash = 0;
    for (let i = 0; i < userId.length; i++) {
        hash = (hash << 5) - hash + userId.charCodeAt(i);
        hash |= 0; 
    }
    const bucket = Math.abs(hash) % 100;
    return bucket < percentage;
}

/**
 * Resolves whether a feature is enabled for a specific user, evaluating staged rollouts.
 * Priority: Explicit Allowlist -> Percentage -> Global Fallback
 */
function isFeatureEnabled(featureName, userId) {
    const rollout = stagedRollouts[featureName];
    
    if (rollout && userId) {
        if (rollout.allowlist.has(userId)) {
            return true;
        }
        if (isUserInPercentage(userId, rollout.percentage)) {
            return true;
        }
    }
    
    // Fallback to global static flag
    return !!features[featureName];
}

module.exports = {
    ...features,
    isFeatureEnabled
};
