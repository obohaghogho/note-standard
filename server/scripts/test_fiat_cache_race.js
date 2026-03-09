/**
 * Test to verify Request Collapsing and Negative Caching
 */
const exchangeRateProvider = require("../providers/exchangeRateProvider");
const cache = require("../utils/cache");

async function testConcurrentRequests() {
  console.log("--- STARTING CONCURRENT CACHE TEST ---");

  // 1. Test Request Collapsing
  // We'll trigger 5 requests simultaneously. Only 1 should hit the API (in theory).
  // The logs should only show ONE "[ExchangeRateProvider] API Fetch" entry if it succeeds or fails once.
  console.log("Triggering 5 concurrent requests for USD/NGN...");
  const results = await Promise.all([
    exchangeRateProvider.getFiatRate("USD", "NGN"),
    exchangeRateProvider.getFiatRate("USD", "NGN"),
    exchangeRateProvider.getFiatRate("USD", "NGN"),
    exchangeRateProvider.getFiatRate("USD", "NGN"),
    exchangeRateProvider.getFiatRate("USD", "NGN"),
  ]);

  console.log("Concurrent results obtained:", results);

  // 2. Test Negative Caching
  // If the first call failed (API was already limited), the second call (immediately after)
  // should return null (the cached failure) without another API hit message.
  console.log("\nTriggering a follow-up request to test negative caching...");
  const followUp = await exchangeRateProvider.getFiatRate("USD", "NGN");
  console.log(
    "Follow-up result (should be cached failure if first failed):",
    followUp,
  );

  console.log("\n--- TEST COMPLETE ---");
}

testConcurrentRequests().catch(console.error);
