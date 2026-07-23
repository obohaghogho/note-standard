require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");

async function testVirtualAccountCreation() {
  console.log("=================================================");
  console.log("  Testing Anchor Virtual Account API Generation  ");
  console.log("=================================================");

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

  // Step 1: Onboard or get Customer
  console.log("\n[Step 1] Creating/Checking Individual Customer...");
  const customerPayload = {
    data: {
      type: "IndividualCustomer",
      attributes: {
        email: `test_user_${Date.now()}@example.com`,
        fullName: {
          firstName: "Manuel",
          lastName: "Test",
        },
        phoneNumber: "+2348012345678",
      },
    },
  };

  let customerId = null;
  try {
    const custRes = await client.post("/customers", customerPayload);
    console.log("✅ Customer Created Response:", JSON.stringify(custRes.data, null, 2));
    customerId = custRes.data?.data?.id;
  } catch (err) {
    console.error("❌ Customer Creation Failed:", err.response?.status, JSON.stringify(err.response?.data || err.message, null, 2));
    
    // Fallback: fetch existing customers to use an existing customer ID for account test
    try {
      const getCustRes = await client.get("/customers");
      const customers = getCustRes.data?.data || [];
      if (customers.length > 0) {
        customerId = customers[0].id;
        console.log(`ℹ️ Fallback: Using existing customer ID ${customerId}`);
      }
    } catch (e) {
      console.error("Failed fetching fallback customers:", e.message);
    }
  }

  if (!customerId) {
    console.error("Cannot proceed without a customerId.");
    process.exit(1);
  }

  // Step 2: Request Virtual Deposit Account
  console.log(`\n[Step 2] Creating Virtual Deposit Account for Customer ID ${customerId}...`);
  const accountPayloads = [
    // Variant A: JSON:API standard format
    {
      name: "JSON:API DepositAccount format",
      payload: {
        data: {
          type: "DepositAccount",
          attributes: {
            currency: "NGN",
          },
          relationships: {
            customer: {
              data: {
                type: "IndividualCustomer",
                id: customerId,
              },
            },
          },
        },
      },
    },
    // Variant B: Simple flat format
    {
      name: "Flat format",
      payload: {
        customerId: customerId,
        type: "deposit",
        currency: "NGN",
      },
    },
  ];

  for (const varItem of accountPayloads) {
    console.log(`\n--- Testing ${varItem.name} ---`);
    console.log("Payload:", JSON.stringify(varItem.payload, null, 2));
    try {
      const accRes = await client.post("/accounts", varItem.payload);
      console.log("✅ Account Created Response:", JSON.stringify(accRes.data, null, 2));
    } catch (err) {
      console.error("❌ Account Creation Failed:", err.response?.status, JSON.stringify(err.response?.data || err.message, null, 2));
    }
  }

  console.log("\n=================================================");
  console.log("  Anchor Virtual Account Test Complete  ");
  console.log("=================================================");
  process.exit(0);
}

testVirtualAccountCreation().catch((err) => {
  console.error("Test Error:", err.message);
  process.exit(1);
});
