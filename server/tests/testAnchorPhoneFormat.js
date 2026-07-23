require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");

async function testPhoneNumberValidation() {
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

  const testCases = [
    { name: "Without phoneNumber field", attributes: { email: `test_no_phone_${Date.now()}@example.com`, fullName: { firstName: "No", lastName: "Phone" } } },
    { name: "With dummy valid Nigerian phone 2348000000000", attributes: { email: `test_dummy_phone_${Date.now()}@example.com`, fullName: { firstName: "Dummy", lastName: "Phone" }, phoneNumber: "2348000000000" } },
    { name: "With 08000000000", attributes: { email: `test_local_phone_${Date.now()}@example.com`, fullName: { firstName: "Local", lastName: "Phone" }, phoneNumber: "08000000000" } },
  ];

  for (const tc of testCases) {
    console.log(`\n--- Testing ${tc.name} ---`);
    try {
      const res = await client.post("/customers", {
        data: {
          type: "IndividualCustomer",
          attributes: tc.attributes,
        },
      });
      console.log("✅ SUCCESS:", res.data?.data?.id);
    } catch (err) {
      console.error("❌ ERROR:", err.response?.status, JSON.stringify(err.response?.data || err.message));
    }
  }
}

testPhoneNumberValidation().catch(console.error);
