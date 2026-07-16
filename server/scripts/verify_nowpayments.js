const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const API_KEY = process.env.NOWPAYMENTS_API_KEY;
const BASE_URL = process.env.NOWPAYMENTS_BASE_URL ||
  "https://api.nowpayments.io";

async function verifyKeys() {
  console.log("--- NowPayments Key Verification ---");
  console.log(`Base URL: ${BASE_URL}`);
  console.log(
    `API Key:  ${API_KEY ? API_KEY.substring(0, 7) + "..." : "MISSING"}`,
  );

  if (!API_KEY) {
    console.error("❌ Error: NOWPAYMENTS_API_KEY is missing in .env");
    return;
  }

  try {
    console.log("📡 Testing connection to NowPayments /status...");
    const statusResponse = await axios.get(`${BASE_URL}/v1/status`);
    console.log("✅ Status API Response:", statusResponse.data);

    console.log("\n📡 Testing API Key with /currencies...");
    const response = await axios.get(`${BASE_URL}/v1/currencies`, {
      headers: {
        "x-api-key": API_KEY,
      },
    });

    if (response.data && response.data.currencies) {
      console.log(
        `✅ Success! Found ${response.data.currencies.length} supported currencies.`,
      );
      console.log("🚀 NowPayments integration is functional.");
    } else {
      console.log("⚠️ Unexpected response format:", response.data);
    }
  } catch (error) {
    console.error("❌ Verification Failed!");
    if (error.response) {
      console.error(`Status: ${error.response.status}`);
      console.error("Data:  ", error.response.data);
      if (error.response.status === 401) {
        console.error("\n💡 HINT: Your API key is likely invalid or inactive.");
      }
    } else {
      console.error("Error Message:", error.message);
    }
  }
}

verifyKeys();
