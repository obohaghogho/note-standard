require('dotenv').config();
const PaystackProvider = require('../server/services/payment/providers/PaystackProvider');

async function run() {
  const provider = new PaystackProvider();
  try {
    const result = await provider.initialize({
      email: "test@example.com",
      amount: 1000,
      currency: "NGN",
      reference: "test_" + Date.now(),
      metadata: { test: true }
    });
    console.log("Success:", result);
  } catch (error) {
    console.error("Error:", error.message);
  }
}

run();
