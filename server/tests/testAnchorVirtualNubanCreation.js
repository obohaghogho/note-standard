require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");

async function testVirtualNubanWithSettlement() {
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

  // Step 1: Get Deposit Account for settlement
  const accRes = await client.get("/accounts");
  const accounts = accRes.data?.data || [];
  console.log(`Found ${accounts.length} accounts.`);
  
  // Find FBO or SETTLEMENT account
  const settlementAcc = accounts.find(a => a.attributes?.type === "FBO" || a.attributes?.type === "SETTLEMENT") || accounts[0];
  console.log("Selected Settlement Account:", settlementAcc.id, settlementAcc.attributes?.accountName, settlementAcc.attributes?.type);

  // Step 2: Test creating Virtual NUBAN with JSON:API format
  const payload = {
    data: {
      type: "VirtualNuban",
      attributes: {
        name: "Manuel Test Customer",
      },
      relationships: {
        settlementAccount: {
          data: {
            type: "DepositAccount",
            id: settlementAcc.id,
          },
        },
      },
    },
  };

  console.log("Sending Payload:", JSON.stringify(payload, null, 2));

  try {
    const res = await client.post("/virtual-nubans", payload);
    console.log("=================================================");
    console.log("✅ VIRTUAL NUBAN CREATION SUCCESSFUL!");
    console.log("=================================================");
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("❌ Creation Error:", err.response?.status, JSON.stringify(err.response?.data || err.message, null, 2));
  }
}

testVirtualNubanWithSettlement().catch(console.error);
