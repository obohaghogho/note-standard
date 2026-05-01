const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const PaystackProvider = require("../services/payment/providers/PaystackProvider");
const logger = require("../utils/logger");

async function testPaystackUSD() {
  console.log("--- PAYSTACK USD CARD TEST ---");
  const provider = new PaystackProvider();

  const testData = {
    email: "test_usd_user@notestandard.com",
    amount: 10, // $10
    currency: "USD",
    reference: "TEST_USD_" + Date.now(),
    callbackUrl: "http://localhost:5173/payment/success",
    metadata: {
        userId: "69b1cb79f8a5a60012890b6c", // Placeholder
        type: "DEPOSIT"
    }
  };

  console.log(`Attempting to initialize $${testData.amount} USD deposit...`);
  
  try {
    const result = await provider.initialize(testData);
    console.log("✅ SUCCESS!");
    console.log("Checkout URL:", result.checkoutUrl);
    console.log("Provider Reference:", result.providerReference);
    
    if (result.checkoutUrl.includes("ngn") || result.checkoutUrl.includes("NGN")) {
        console.log("\n💡 NOTE: Paystack converted this to NGN because you are in TEST MODE.");
        console.log("In LIVE MODE, this will remain in USD.");
    }
  } catch (error) {
    console.log("❌ FAILED");
    console.log("Error Message:", error.message);
  }
}

testPaystackUSD();
