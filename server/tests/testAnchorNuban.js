require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");

async function testAnchorNubanEndpoints() {
  const baseUrl = process.env.ANCHOR_BASE_URL || "https://api.sandbox.getanchor.co/api/v1";
  const apiKey = process.env.ANCHOR_SECRET_KEY;

  const client = axios.create({
    baseURL: baseUrl,
    headers: {
      "x-anchor-key": apiKey,
      "Content-Type": "application/json",
    },
    timeout: 10000,
  });

  const endpointsToTest = [
    { name: "GET /products", path: "/products" },
    { name: "GET /virtual-nubans", path: "/virtual-nubans" },
    { name: "GET /sub-accounts", path: "/sub-accounts" },
  ];

  for (const ep of endpointsToTest) {
    try {
      const res = await client.get(ep.path);
      console.log(`✅ ${ep.name} -> Status 200:`, JSON.stringify(res.data, null, 2).substring(0, 500));
    } catch (err) {
      console.log(`❌ ${ep.name} -> Error:`, err.response?.status, JSON.stringify(err.response?.data || err.message));
    }
  }

  // Also test creating Virtual NUBAN if endpoint exists
  console.log("\n--- Testing POST /virtual-nubans ---");
  try {
    const vnRes = await client.post("/virtual-nubans", {
      data: {
        type: "VirtualNuban",
        attributes: {
          name: "Manuel Test Account",
        },
      },
    });
    console.log("✅ POST /virtual-nubans Response:", JSON.stringify(vnRes.data, null, 2));
  } catch (err) {
    console.log("❌ POST /virtual-nubans Error:", err.response?.status, JSON.stringify(err.response?.data || err.message));
  }
}

testAnchorNubanEndpoints().catch(console.error);
