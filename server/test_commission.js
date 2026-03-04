const commissionService = require("./services/commissionService");
const mathUtils = require("./utils/mathUtils");

async function testCommission() {
  console.log("=== Commission Logic Test ===");

  const amount = 1000;
  const currency = "USD";

  // Test calculateCommission
  const comm = await commissionService.calculateCommission(
    "SWAP",
    amount,
    currency,
    "FREE",
  );

  // Test Spread calculation
  const spread = await commissionService.calculateSpread("BUY", 50000, "FREE");

  const results = `
    Swap 1000 USD Fee (at 7.5%): ${comm.fee} (Expected: 75.00)
    BTC 50000 USD Spread (at 7.5%): ${spread.spreadAmount} (Expected: 3750.00)
    `;
  require("fs").writeFileSync("test_commission_results.txt", results);
  console.log("Done");

  console.log(
    "\nNote: Triggering logRevenue would attempt to call RPCs add_affiliate_commission and add_global_reward.",
  );
  console.log(
    "Ensure migration 082 is applied in the database for those to work.",
  );
}

testCommission().catch(console.error);
