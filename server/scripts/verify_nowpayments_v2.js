const axios = require("axios");
const path = require("path");
const https = require("https");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const API_KEY = process.env.NOWPAYMENTS_API_KEY;
const BASE_URL = process.env.NOWPAYMENTS_BASE_URL ||
  "https://api.nowpayments.io";

const agent = new https.Agent({
  rejectUnauthorized: false,
});

async function verifyKeys() {
  console.log("--- NowPayments Key Verification (No SSL Check) ---");
  try {
    const response = await axios.get(`${BASE_URL}/v1/status`, {
      httpsAgent: agent,
      timeout: 10000,
    });
    console.log("✅ Status:", response.data);

    const currencies = await axios.get(`${BASE_URL}/v1/currencies`, {
      headers: { "x-api-key": API_KEY },
      httpsAgent: agent,
      timeout: 10000,
    });
    console.log(
      "✅ Auth worked, found currencies:",
      currencies.data.currencies.length,
    );
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.response) console.error("Response:", error.response.data);
  }
}

verifyKeys();
