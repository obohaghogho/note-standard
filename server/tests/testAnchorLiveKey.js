require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");

async function testAnchorLiveKey() {
  console.log("================================================");
  console.log("  Testing Anchor Sandbox API Key Verification  ");
  console.log("================================================");

  const baseUrl = process.env.ANCHOR_BASE_URL || "https://api.sandbox.getanchor.co/api/v1";
  const apiKey = process.env.ANCHOR_SECRET_KEY;

  console.log(`Base URL: ${baseUrl}`);
  console.log(`API Key (masked): ${apiKey ? apiKey.substring(0, 10) + "..." + apiKey.substring(apiKey.length - 6) : "MISSING"}`);

  if (!apiKey) {
    console.error("❌ ANCHOR_SECRET_KEY is missing in server/.env");
    process.exit(1);
  }

  // Header options to test
  const headerVariants = [
    { name: "x-anchor-key header", headers: { "x-anchor-key": apiKey, "Content-Type": "application/json" } },
    { name: "Bearer Token header", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } },
    { name: "x-anchor-key + Bearer headers", headers: { "x-anchor-key": apiKey, Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" } },
  ];

  // Endpoints to test
  const endpoints = [
    { name: "GET /banks", method: "GET", path: "/banks" },
    { name: "GET /customers", method: "GET", path: "/customers" },
    { name: "GET /accounts", method: "GET", path: "/accounts" },
    { name: "GET /health", method: "GET", path: "/health" },
  ];

  for (const variant of headerVariants) {
    console.log(`\n--- Testing Auth Header Style: [ ${variant.name} ] ---`);
    const client = axios.create({ baseURL: baseUrl, headers: variant.headers, timeout: 10000 });

    for (const ep of endpoints) {
      try {
        let res;
        if (ep.method === "GET") {
          res = await client.get(ep.path);
        }
        console.log(`✅ [${ep.name}] -> Status ${res.status}:`, JSON.stringify(res.data).substring(0, 150));
      } catch (err) {
        const status = err.response?.status;
        const msg = err.response?.data || err.message;
        if (status === 401 || status === 403) {
          console.log(`❌ [${ep.name}] -> UNAUTHORIZED (Status ${status}):`, JSON.stringify(msg));
        } else {
          console.log(`⚠️ [${ep.name}] -> Status ${status || 'Error'}:`, JSON.stringify(msg).substring(0, 150));
        }
      }
    }
  }

  console.log("\n================================================");
  console.log("  Anchor Sandbox Key Test Complete  ");
  console.log("================================================");
  process.exit(0);
}

testAnchorLiveKey().catch((err) => {
  console.error("Test Crash:", err.message);
  process.exit(1);
});
