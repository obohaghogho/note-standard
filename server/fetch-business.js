// fetch-business.js
require("dotenv").config({ path: ".env" });
const axios = require("axios");

async function run() {
  const secretKey = process.env.FINCRA_SECRET_KEY;
  const isTest = secretKey.startsWith("sk_test_") || secretKey.startsWith("pk_test_");
  const baseUrl = isTest ? "https://sandboxapi.fincra.com" : "https://api.fincra.com";

  try {
    const response = await axios.get(`${baseUrl}/profile/merchants/me`, {
      headers: { "api-key": secretKey }
    });
    console.log("Business Profile:", JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error("Error fetching profile:", err.response?.data || err.message);
  }
}

run();
