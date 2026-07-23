require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");

async function testCustomerOnboardingFormat() {
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

  const email = `user_${Date.now()}@example.com`;
  const phoneNumber = "2348012345679";

  console.log("--- Testing Customer Onboarding Format ---");
  const payload = {
    data: {
      type: "IndividualCustomer",
      attributes: {
        email: email,
        fullName: {
          firstName: "Test",
          lastName: "User",
        },
        phoneNumber: phoneNumber,
      },
    },
  };

  try {
    const res = await client.post("/customers", payload);
    console.log("=================================================");
    console.log("✅ CUSTOMER ONBOARDING SUCCESSFUL!");
    console.log("=================================================");
    console.log(JSON.stringify(res.data, null, 2));
  } catch (err) {
    console.error("❌ Onboarding Error:", err.response?.status, JSON.stringify(err.response?.data || err.message, null, 2));
  }
}

testCustomerOnboardingFormat().catch(console.error);
