require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const providerRegistry = require('../services/settlement/ProviderRegistry');
const settlementLayerRouter = require('../services/settlement/SettlementLayerRouter');
const TreasuryService = require('../services/treasury/TreasuryService');
const pool = require('../config/pgPool');
const assert = require('assert');

async function testPhase3Gate() {
  console.log("=== [PHASE 3 VERIFICATION GATE] Testing Treasury Layer & Provider Registry ===");

  try {
    // Test 1: ProviderRegistry Registration & Capabilities
    console.log("\n[Test 1] Verifying ProviderRegistry registration...");
    const ids = providerRegistry.getRegisteredProviderIds();
    console.log("✓ Registered Providers:", ids);
    assert.ok(ids.includes('NOWPAYMENTS'), "NOWPAYMENTS must be registered");
    assert.ok(ids.includes('FINCRA'), "FINCRA must be registered");
    assert.ok(ids.includes('ANCHOR'), "ANCHOR must be registered");

    const capsNOW = providerRegistry.getCapabilities('NOWPAYMENTS');
    assert.strictEqual(capsNOW.supports_custody, true);
    console.log("✓ NOWPayments capabilities verified:", capsNOW);

    // Test 2: Settlement Layer Router Priority & Failover Routing
    console.log("\n[Test 2] Verifying SettlementLayerRouter priority list...");
    const priorityUSDT = settlementLayerRouter.getProviderPriorityList('USDT');
    assert.deepStrictEqual(priorityUSDT, ['NOWPAYMENTS', 'FINCRA', 'ANCHOR']);
    console.log("✓ USDT Priority List verified:", priorityUSDT);

    // Test 3: TreasuryService Reserve Ratio Calculation
    console.log("\n[Test 3] Calculating Treasury Reserve Ratios...");
    // Seed test custody balance for USDT
    await pool.query(
      `INSERT INTO public.custody_balances (provider_id, currency, available, locked, pending)
       VALUES ('NOWPAYMENTS', 'USDT', 5000.0, 0, 0)
       ON CONFLICT (provider_id, currency) DO UPDATE SET available = 5000.0`
    );

    const reserveReport = await TreasuryService.calculateReserveRatios();
    console.log("✓ Treasury Reserve Ratio Report:");
    console.table(reserveReport);

    // Test 4: Liquidity Check
    console.log("\n[Test 4] Testing Liquidity Checks...");
    const has2500 = await TreasuryService.checkSettlementLiquidity('NOWPAYMENTS', 'USDT', 2500.0);
    assert.strictEqual(has2500, true, "NOWPayments should have 2500 USDT liquidity");

    const has10000 = await TreasuryService.checkSettlementLiquidity('NOWPAYMENTS', 'USDT', 10000.0);
    assert.strictEqual(has10000, false, "NOWPayments should reject 10000 USDT request due to insufficient liquidity");
    console.log("✓ Settlement Liquidity Check passed!");

    console.log("\n============================================================");
    console.log("=== [PHASE 3 VERIFICATION GATE] PASSED 100% CLEANLY ===");
    console.log("============================================================");
  } catch (err) {
    console.error("❌ Phase 3 Gate FAILED:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

testPhase3Gate();
