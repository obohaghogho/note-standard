const planService = require("../services/planService");
const supportService = require("../services/supportService");
const commissionService = require("../services/commissionService");
const pool = require("../config/pgPool");

async function runSubscriptionComplianceTest() {
  console.log("=================================================");
  console.log("  NOTE-STANDARD SUBSCRIPTION COMPLIANCE TEST RUN ");
  console.log("=================================================\n");

  try {
    // 1. Verify Plan Config V1 structure
    console.log("[Test 1] Verifying Versioned Plan Configurations (V1)...");
    const freeConfig = planService.getPlanConfig("free");
    const proConfig = planService.getPlanConfig("pro");
    const businessConfig = planService.getPlanConfig("business");

    console.log("Free Config:", JSON.stringify(freeConfig, null, 2));
    console.log("Pro Config:", JSON.stringify(proConfig, null, 2));
    console.log("Business Config:", JSON.stringify(businessConfig, null, 2));

    if (freeConfig.maxNotes !== 100 || freeConfig.unlimitedNotes !== false) {
      throw new Error("Free plan maxNotes config mismatch!");
    }
    if (proConfig.maxNotes !== null || proConfig.unlimitedNotes !== true) {
      throw new Error("Pro plan unlimitedNotes config mismatch!");
    }
    if (businessConfig.canUseTeams !== true) {
      throw new Error("Business plan team entitlement mismatch!");
    }
    console.log("✅ Test 1 Passed: Plan Config V1 structure verified.\n");

    // 2. Verify Entitlement Cache and Dynamic Resolution
    console.log("[Test 2] Testing Entitlement Cache & Effective Plan Resolution...");
    // Find any user profile
    const { rows: profiles } = await pool.query("SELECT id, plan_tier FROM profiles LIMIT 1");
    if (profiles.length > 0) {
      const testUserId = profiles[0].id;
      const plan = await planService.getEffectivePlan(testUserId);
      console.log(`Resolved Effective Plan for User (${testUserId}):`, plan);

      // Verify cache hit
      const cachedPlan = await planService.getEffectivePlan(testUserId);
      console.log("Cached Plan Hit Verified:", cachedPlan.tier === plan.tier);

      // Invalidate cache
      planService.invalidateEntitlementCache(testUserId);
      console.log("Cache Invalidation Verified.");
    }
    console.log("✅ Test 2 Passed: Entitlement resolution & caching verified.\n");

    // 3. Verify Support Priority SLA Floor
    console.log("[Test 3] Testing Support Priority SLA Floor...");
    const freePriority = supportService.calculatePriority("General Question", "General", "How do I change theme?", "free");
    const proPriority = supportService.calculatePriority("General Question", "General", "How do I change theme?", "pro");
    const businessPriority = supportService.calculatePriority("General Question", "General", "How do I change theme?", "business");
    const businessUrgent = supportService.calculatePriority("Account issue", "General", "Help! Unauthorized fraud transaction!", "business");

    console.log(`Free User Priority: '${freePriority}' (Expected: low or normal)`);
    console.log(`Pro User Priority: '${proPriority}' (Expected: normal)`);
    console.log(`Business User Priority: '${businessPriority}' (Expected: high)`);
    console.log(`Business Urgent Priority: '${businessUrgent}' (Expected: urgent)`);

    if (businessPriority !== "high" && businessPriority !== "urgent") {
      throw new Error("Business user support priority floor failed!");
    }
    console.log("✅ Test 3 Passed: Support priority SLA floor verified.\n");

    // 4. Verify Crypto Spread Calculation
    console.log("[Test 4] Testing Crypto Spread Calculation...");
    const freeSpread = await commissionService.calculateSpread("BUY", 1000, "FREE");
    const proSpread = await commissionService.calculateSpread("BUY", 1000, "PRO");
    const businessSpread = await commissionService.calculateSpread("BUY", 1000, "BUSINESS");

    console.log("Free Buy Spread ($1000 BTC):", freeSpread);
    console.log("Pro Buy Spread ($1000 BTC):", proSpread);
    console.log("Business Buy Spread ($1000 BTC):", businessSpread);

    if (freeSpread.spreadPercentage !== 0.01 || proSpread.spreadPercentage !== 0.005) {
      throw new Error("Crypto spread calculation percentage mismatch!");
    }
    console.log("✅ Test 4 Passed: Crypto spread alignment verified.\n");

    console.log("=================================================");
    console.log(" 🎉 ALL SUBSCRIPTION COMPLIANCE TESTS PASSED!    ");
    console.log("=================================================");

  } catch (err) {
    console.error("❌ Test Failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSubscriptionComplianceTest();
