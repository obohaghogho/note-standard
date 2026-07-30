require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const eventBus = require('../services/events/LocalEventBus');
const CryptoCustodySyncWorker = require('../workers/CryptoCustodySyncWorker');
const CryptoReconciliationEngine = require('../services/reconciliation/CryptoReconciliationEngine');
const TreasuryRebalancerWorker = require('../workers/TreasuryRebalancerWorker');
const pool = require('../config/pgPool');
const assert = require('assert');

async function testPhase5Gate() {
  console.log("=== [PHASE 5 VERIFICATION GATE] Testing Workers, Reconciliation Engine & Event Bus ===");

  try {
    // Test 1: EventBus Publish/Subscribe
    console.log("\n[Test 1] Testing EventBus Publish/Subscribe...");
    let eventReceived = false;
    eventBus.subscribe('test.event', (data) => {
      eventReceived = true;
      console.log("✓ EventBus received test event payload:", data);
    });

    await eventBus.publish('test.event', { foo: 'bar', timestamp: Date.now() });
    await new Promise(r => setTimeout(r, 200));
    assert.strictEqual(eventReceived, true, "Event handler must be triggered");

    // Test 2: Custody Sync Worker
    console.log("\n[Test 2] Testing CustodySyncWorker sync cycle...");
    const syncRes = await CryptoCustodySyncWorker.sync();
    assert.ok(Array.isArray(syncRes), "Sync result must be an array of balances");
    console.log(`✓ CustodySyncWorker synced ${syncRes.length} provider balance records.`);

    const syncLogRes = await pool.query(`SELECT * FROM public.custody_sync_logs ORDER BY created_at DESC LIMIT 1`);
    assert.strictEqual(syncLogRes.rows.length, 1, "Sync log entry must be saved");
    console.log("✓ Custody sync log entry verified in DB. Duration:", syncLogRes.rows[0].duration_ms, "ms");

    // Test 3: Multi-Level Reconciliation Engine
    console.log("\n[Test 3] Testing CryptoReconciliationEngine multi-level sweep...");
    const reconReport = await CryptoReconciliationEngine.runReconciliation();
    assert.ok(reconReport.id, "Reconciliation report must have ID");
    console.log("✓ Reconciliation Report generated. ID:", reconReport.id, "Status:", reconReport.status);

    // Test 4: Treasury Rebalancer Worker
    console.log("\n[Test 4] Testing TreasuryRebalancerWorker evaluation...");
    const rebalRes = await TreasuryRebalancerWorker.evaluateRebalance();
    assert.ok(Array.isArray(rebalRes), "Rebalancer result must be array of ratios");
    console.log("✓ TreasuryRebalancer evaluated ratios for currencies:", rebalRes.map(r => `${r.currency}: ${r.reserveRatioPercent}% (${r.status})`));

    console.log("\n============================================================");
    console.log("=== [PHASE 5 VERIFICATION GATE] PASSED 100% CLEANLY ===");
    console.log("============================================================");
  } catch (err) {
    console.error("❌ Phase 5 Gate FAILED:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testPhase5Gate();
