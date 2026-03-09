const axios = require("axios");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const NOWPAYMENTS_API_KEY = process.env.NOWPAYMENTS_API_KEY;
const baseUrl = "https://api.nowpayments.io/v1";

async function testNowPayments() {
  console.log("Testing NOWPayments API Key...");
  console.log(`Key: ${NOWPAYMENTS_API_KEY}`);

  try {
    const response = await axios.get(`${baseUrl}/currencies`, {
      headers: { "x-api-key": NOWPAYMENTS_API_KEY },
    });
    console.log("SUCCESS: Currencies fetched!");
    // console.log(response.data.currencies.slice(0, 5));

    console.log(
      "Attempting to create a test payment for address generation...",
    );
    const payment = await axios.post(`${baseUrl}/payment`, {
      price_amount: 1,
      price_currency: "usd",
      pay_currency: "btc",
      order_id: "test_" + Date.now(),
    }, {
      headers: {
        "x-api-key": NOWPAYMENTS_API_KEY,
        "Content-Type": "application/json",
      },
    });

    console.log("Result:", JSON.stringify(payment.data, null, 2));
  } catch (error) {
    console.error(
      "FAILURE:",
      error.response
        ? JSON.stringify(error.response.data, null, 2)
        : error.message,
    );
  }
}

testNowPayments();
