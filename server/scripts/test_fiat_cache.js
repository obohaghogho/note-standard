const exchangeRateProvider = require("../providers/exchangeRateProvider");
const logger = require("../utils/logger");

async function testFiatCache() {
  console.log("--- TEST: FIAT RATE CACHING ---");

  // First call should trigger API
  console.log("First call for USD/JPY...");
  const start1 = Date.now();
  const rate1 = await exchangeRateProvider.getFiatRate("USD", "JPY");
  const end1 = Date.now();
  console.log(`Rate: ${rate1}, Time: ${end1 - start1}ms`);

  // Second call for same base should be cached
  console.log("\nSecond call for USD/EUR (same base, should be cached)...");
  const start2 = Date.now();
  const rate2 = await exchangeRateProvider.getFiatRate("USD", "EUR");
  const end2 = Date.now();
  console.log(`Rate: ${rate2}, Time: ${end2 - start2}ms`);

  if ((end2 - start2) < (end1 - start1) / 2) {
    console.log("\nSUCCESS: Caching is working (significant time reduction)");
  } else {
    console.log("\nWARNING: Cache might not be hit or API was very fast.");
  }
}

testFiatCache().catch(console.error);
