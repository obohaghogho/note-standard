const fxService = require("./services/fxService");
const logger = require("./utils/logger");

async function testBatch() {
  console.log("Testing Batch Rate Fetching...");
  try {
    const start = Date.now();
    const rates = await fxService.getAllRates("USD");
    const end = Date.now();

    console.log("Rates fetched in", end - start, "ms");
    console.log(JSON.stringify(rates, null, 2));

    // Check if we have essential rates
    const required = ["BTC", "ETH", "USDT", "NGN", "JPY"];
    const missing = required.filter((r) => !rates[r] || rates[r] === 0);

    if (missing.length === 0) {
      console.log("SUCCESS: All required rates are present and non-zero.");
    } else {
      console.log("WARNING: Some rates are missing or zero:", missing);
    }
  } catch (err) {
    console.error("FAILED:", err.message);
  }
}

testBatch();
