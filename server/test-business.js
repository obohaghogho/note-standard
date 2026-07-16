// test-business.js
require("dotenv").config({ path: ".env" });
const axios = require("axios");
const fs = require("fs");

async function run() {
  const reference = "tx_489a90c7bf3b4e08bb92526cc430c374";
  const secretKey = process.env.FINCRA_SECRET_KEY;
  const publicKey = process.env.FINCRA_PUBLIC_KEY;
  const businessId = process.env.FINCRA_BUSINESS_ID;
  
  const isTest = (secretKey && (secretKey.startsWith("sk_test_") || secretKey.startsWith("pk_test_"))) ||
                 (publicKey && publicKey.startsWith("pk_test_"));
                 
  const baseUrl = isTest ? "https://sandboxapi.fincra.com" : "https://api.fincra.com";

  try {
    const response = await axios.get(`${baseUrl}/checkout/payments/merchant-reference/${reference}`, {
      headers: {
        "api-key": (secretKey || "").trim(),
        "x-pub-key": (publicKey || "").trim(),
        "x-business-id": (businessId || "").trim(),
        "Content-Type": "application/json",
      }
    });
    fs.writeFileSync("fincra-response.json", JSON.stringify(response.data, null, 2));
  } catch (err) {
    fs.writeFileSync("fincra-response.json", JSON.stringify({ error: err.response?.data || err.message }, null, 2));
  }
}

run();
