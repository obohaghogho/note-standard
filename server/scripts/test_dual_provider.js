/**
 * Test to verify Dual Provider Strategy (Frankfurter + ExchangeRate-API)
 */
const exchangeRateProvider = require("../providers/exchangeRateProvider");

async function testDualProvider() {
  console.log("--- STARTING DUAL PROVIDER TEST ---");

  // 1. Test Frankfurter (Primary)
  console.log("Fetching USD/EUR (Expected to use Frankfurter)...");
  const eurRate = await exchangeRateProvider.getFiatRate("USD", "EUR");
  console.log("USD/EUR Rate:", eurRate);

  // 2. Test Fallback (ExchangeRate-API) for NGN
  console.log(
    "\nFetching USD/NGN (Expected to fallback to ExchangeRate-API)...",
  );
  const ngnRate = await exchangeRateProvider.getFiatRate("USD", "NGN");
  console.log("USD/NGN Rate:", ngnRate);

  if (eurRate && ngnRate) {
    console.log(
      "\nSUCCESS: Both Frankfurter and Fallback providers are working!",
    );
  } else {
    console.error("\nFAILURE: One or both providers failed.");
    process.exit(1);
  }

  console.log("\n--- TEST COMPLETE ---");
}

testDualProvider().catch((err) => {
  console.error(err);
  process.exit(1);
});
