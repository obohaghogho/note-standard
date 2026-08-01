'use strict';
/**
 * providerCapabilityEngine.test.js
 * =================================
 * Automated test suite for Enterprise Provider-Aware Payment Capabilities Engine (v3.0).
 */

const assert = require('assert');
const ProviderCapabilityRegistry = require('../services/payment/ProviderCapabilityRegistry');

async function runTests() {
  console.log("==================================================================");
  console.log("🚀 Running Provider Capability Engine Test Suite (v3.0 Enterprise)");
  console.log("==================================================================");

  // Test 1: Merged Capabilities Document
  console.log("\n[Test 1] Fetching merged capabilities...");
  const merged = await ProviderCapabilityRegistry.getMergedCapabilities('FREE');
  
  assert.ok(merged.version, "Capability document must contain a version integer");
  assert.ok(merged.currencies, "Capability document must contain currencies object");
  assert.ok(merged.currencies['USD'], "USD must be present in capabilities");
  assert.ok(merged.currencies['TZS'], "TZS must be present in capabilities");
  assert.ok(merged.currencies['NGN'], "NGN must be present in capabilities");
  console.log(`✓ Merged capabilities returned v${merged.version} with ${Object.keys(merged.currencies).length} active currencies.`);

  // Test 2: Operation-Specific Rail Assertions (USD)
  console.log("\n[Test 2] Verifying USD operation-specific rails (PRO Tier)...");
  const usdPro = (await ProviderCapabilityRegistry.getMergedCapabilities('PRO')).currencies['USD'];
  const usdDepTypes = usdPro.depositMethods.map(r => r.type);
  const usdWdTypes = usdPro.withdrawMethods.map(r => r.type);

  assert.ok(usdDepTypes.includes('card'), "USD deposit must support Card");
  assert.ok(usdDepTypes.includes('ach'), "USD deposit must support ACH");
  assert.ok(usdDepTypes.includes('wire'), "USD deposit must support Wire");
  
  assert.strictEqual(usdWdTypes.includes('card'), false, "Card must NOT appear on USD withdrawal");
  assert.ok(usdWdTypes.includes('ach'), "USD withdrawal must support ACH");
  assert.ok(usdWdTypes.includes('wire'), "USD withdrawal must support Wire");
  console.log("✓ USD operation separation & tier filtering verified (Card = Deposit only, ACH/Wire = Both).");

  // Test 3: Provider-Aware Currency Customization (TZS Tanzania)
  console.log("\n[Test 3] Verifying TZS Tanzania payment rails...");
  const tzs = merged.currencies['TZS'];
  const tzsDepTypes = tzs.depositMethods.map(r => r.type);
  
  assert.strictEqual(tzsDepTypes.includes('card'), false, "TZS must NOT advertise Card payment");
  assert.ok(tzsDepTypes.includes('mobile_money'), "TZS deposit must support Mobile Money");
  assert.ok(tzsDepTypes.includes('bank_transfer'), "TZS deposit must support Bank Transfer");
  console.log("✓ TZS provider-aware rails verified (Mobile Money + Bank Transfer, No Card).");

  // Test 4: EUR SEPA & GBP Faster Payments
  console.log("\n[Test 4] Verifying EUR & GBP regional rails...");
  const eur = merged.currencies['EUR'];
  const gbp = merged.currencies['GBP'];

  assert.ok(eur.depositMethods.some(r => r.type === 'sepa'), "EUR must support SEPA Transfer");
  assert.ok(gbp.depositMethods.some(r => r.type === 'faster_payments'), "GBP must support UK Faster Payments");
  console.log("✓ EUR (SEPA) and GBP (Faster Payments) verified.");

  // Test 5: Admin Grid Telemetry & Provider Health
  console.log("\n[Test 5] Verifying Admin Capabilities Grid & Health Telemetry...");
  const adminGrid = await ProviderCapabilityRegistry.getAdminCapabilitiesGrid();
  assert.ok(adminGrid.totalRails > 0, "Admin grid must return total rails count");
  assert.ok(adminGrid.providers.length >= 3, "Admin grid must report provider health metrics");
  console.log(`✓ Admin grid returned ${adminGrid.totalRails} rails across ${adminGrid.providers.length} providers.`);

  // Test 6: Capability Refresh & Version Increment
  console.log("\n[Test 6] Testing live discovery refresh...");
  const initialVer = merged.version;
  const refreshed = await ProviderCapabilityRegistry.refreshCapabilities();
  assert.strictEqual(refreshed.version, initialVer + 1, "Refreshing capabilities must increment version");
  console.log(`✓ Capability refresh incremented version to v${refreshed.version}`);

  console.log("\n==================================================================");
  console.log("🎉 ALL PROVIDER CAPABILITY ENGINE TESTS PASSED SUCCESSFULLY!");
  console.log("==================================================================");
}

runTests().catch(err => {
  console.error("❌ Test suite failed with error:", err);
  process.exit(1);
});
