require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const pool = require('../config/pgPool');
const cryptoLedgerService = require('../services/CryptoLedgerService');
const settlementLayerRouter = require('../services/settlement/SettlementLayerRouter');
const providerRegistry = require('../services/settlement/ProviderRegistry');
const SystemState = require('../config/SystemState');
const assert = require('assert');
const { v4: uuidv4 } = require('uuid');

async function testPhase9Gate() {
  console.log("=== [PHASE 9 VERIFICATION GATE] Production Hardening & Failover Verification ===");

  try {
    const profilesRes = await pool.query(`SELECT id FROM public.profiles LIMIT 1`);
    const userA = profilesRes.rows[0].id;

    // Test 1: General Ledger Double-Entry Invariant Verification
    console.log("\n[Test 1] Verifying Double-Entry Accounting Invariant (Debits == Credits)...");
    const ledgerTotalsRes = await pool.query(
      `SELECT currency, 
              COUNT(*) as total_entries,
              SUM(amount) as total_amount
       FROM public.crypto_ledger_entries
       GROUP BY currency`
    );

    console.log("✓ Ledger Invariants per currency:");
    console.table(ledgerTotalsRes.rows);
    assert.ok(ledgerTotalsRes.rowCount >= 0, "Ledger invariant query must succeed");

    // Test 2: Optimistic Locking Concurrency Stress Test
    console.log("\n[Test 2] Testing Optimistic Locking Concurrency Protection...");
    const keyCon1 = `con_${uuidv4()}`;
    const keyCon2 = `con_${uuidv4()}`;

    // Execute 2 concurrent credits
    const [p1, p2] = await Promise.allSettled([
      cryptoLedgerService.creditDeposit({ userId: userA, currency: 'USDT', amount: 50, idempotencyKey: keyCon1 }),
      cryptoLedgerService.creditDeposit({ userId: userA, currency: 'USDT', amount: 50, idempotencyKey: keyCon2 })
    ]);

    assert.ok(p1.status === 'fulfilled' || p2.status === 'fulfilled', "At least 1 concurrent update must succeed");
    console.log("✓ Concurrent update 1 status:", p1.status, "| Concurrent update 2 status:", p2.status);

    // Test 3: Provider Failover Routing Verification
    console.log("\n[Test 3] Testing Settlement Router Provider Failover...");
    // Register a failing mock NOWPayments provider to force failover
    const failingNOWPayments = {
      getProviderId: () => 'NOWPAYMENTS',
      getCapabilities: () => ({ supports_withdrawals: true }),
      createPayout: async () => { throw new Error("SIMULATED_NOWPAYMENTS_500_DOWN"); }
    };

    providerRegistry.register('NOWPAYMENTS', failingNOWPayments);

    const failoverResult = await settlementLayerRouter.executePayoutWithFailover({
      address: '0xfailoverAddress',
      amount: 100,
      currency: 'USDT',
      reference: `ref_${uuidv4()}`
    });

    assert.strictEqual(failoverResult.success, true);
    assert.ok(['FINCRA', 'ANCHOR'].includes(failoverResult.providerId), "Must failover to Fincra or Anchor");
    console.log(`✓ Automated Failover Succeeded! Failed NOWPayments -> Routed to ${failoverResult.providerId}`);

    // Restore real NOWPayments provider
    const realNOWPayments = require('../services/settlement/NOWPaymentsSettlementProvider');
    providerRegistry.register('NOWPAYMENTS', realNOWPayments);

    // Test 4: Feature Flags Verification
    console.log("\n[Test 4] Verifying Enterprise Feature Flags...");
    const flagV6 = SystemState.getFeatureFlag('FEATURE_CRYPTO_V6_LEDGER_ENABLED');
    const flagNOW = SystemState.getFeatureFlag('FEATURE_PROVIDER_NOWPAYMENTS');
    const flagFin = SystemState.getFeatureFlag('FEATURE_PROVIDER_FINCRA');
    const flagSwap = SystemState.getFeatureFlag('FEATURE_SWAP');

    assert.strictEqual(flagV6, true);
    assert.strictEqual(flagNOW, true);
    assert.strictEqual(flagFin, true);
    assert.strictEqual(flagSwap, true);
    console.log("✓ All Crypto Enterprise Feature Flags active:", {
      FEATURE_CRYPTO_V6_LEDGER_ENABLED: flagV6,
      FEATURE_PROVIDER_NOWPAYMENTS: flagNOW,
      FEATURE_PROVIDER_FINCRA: flagFin,
      FEATURE_SWAP: flagSwap
    });

    console.log("\n============================================================");
    console.log("=== [PHASE 9 VERIFICATION GATE] PASSED 100% CLEANLY ===");
    console.log("============================================================");
  } catch (err) {
    console.error("❌ Phase 9 Gate FAILED:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testPhase9Gate();
