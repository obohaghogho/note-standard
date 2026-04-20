const settlementEngine = require('../services/SettlementEngine');
const governanceManager = require('../services/GovernanceManager');
const logger = require('../utils/logger');
const supabase = require('../config/database');

/**
 * Institutional Hardening Verification Suite (Phase 6B)
 */
async function runVerifications() {
    logger.info("--- STARTING PHASE 6B VERIFICATIONS ---");

    try {
        // 1. Monotonicity Regression Test
        await testMonotonicity();

        // 2. Spendable Balance Gate Test
        await testSpendableGate();

        // 3. Governance Epoch Invalidation Test
        await testGovernanceEpochLock();

        logger.info("--- ALL VERIFICATIONS PASSED ---");
    } catch (err) {
        logger.error(`!!! VERIFICATION FAILURE: ${err.message}`);
        process.exit(1);
    }
}

/**
 * Verify that state cannot move backwards.
 */
async function testMonotonicity() {
    logger.info("[Verification] Testing Monotonicity Guard...");
    
    // Create a mock transaction in PROVIDER_HARD
    const txId = '00000000-0000-0000-0000-000000000001'; // Mock ID
    const mockTx = {
        id: txId,
        execution_status: 'PROVIDER_HARD',
        provider_id: 'TEST_PROVIDER',
        last_ingested_at: new Date().toISOString()
    };

    // Attempt regression to PROVIDER_SOFT
    try {
        settlementEngine.validateTransitionPreLock(mockTx, 'PROVIDER_SOFT', 'TEST_PROVIDER', new Date().toISOString());
        throw new Error("FAILED: Monotonicity guard allowed regression!");
    } catch (err) {
        if (err.message.includes('STATE_REGRESSION')) {
            logger.info("SUCCESS: Monotonicity guard blocked regression.");
        } else {
            throw err;
        }
    }
}

/**
 * Verify that funds are only spendable after 95% confidence + COMMITTED.
 */
async function testSpendableGate() {
    logger.info("[Verification] Testing Spendable Balance Gate...");

    // We simulate the SQL view behavior via the function call
    const testCases = [
        { status: 'PROVIDER_HARD', conf: 0.99, expected: false },
        { status: 'LEDGER_COMMITTED', conf: 0.90, expected: false },
        { status: 'LEDGER_COMMITTED', conf: 0.95, expected: true }
    ];

    for (const tc of testCases) {
        const { data, error } = await supabase.rpc('is_spendable_v6', {
            p_execution_status: tc.status,
            p_confidence: tc.conf
        });

        if (error) throw error;
        if (data !== tc.expected) {
            throw new Error(`FAILED: Spendable gate mismatch for ${tc.status} at ${tc.conf}. Expected ${tc.expected}, got ${data}`);
        }
    }
    logger.info("SUCCESS: Spendable balance gate enforced correctly.");
}

/**
 * Verify that an epoch change invalidates old proposals.
 */
async function testGovernanceEpochLock() {
    logger.info("[Verification] Testing Governance Epoch Invalidation...");

    const proposal = {
        settlement_epoch_id: 10,
        drift_amount: 0.0005,
        direction: 1
    };

    // Current epoch matches proposal
    const validCheck = await governanceManager.validateProposal(proposal, 0.0005, 10, { state: 'ALLOWED', reason: 'CONSENSUS_STABLE' });
    if (!validCheck.valid) throw new Error("FAILED: Valid proposal was rejected!");

    // Simulate epoch advancement (10 -> 11)
    const invalidCheck = await governanceManager.validateProposal(proposal, 0.0005, 11, { state: 'ALLOWED', reason: 'CONSENSUS_STABLE' });
    if (invalidCheck.valid || invalidCheck.reason !== 'EPOCH_ADVANCED') {
        throw new Error("FAILED: Proposal was not invalidated by epoch advancement!");
    }

    logger.info("SUCCESS: Governance epoch lock enforced.");
}

runVerifications();
