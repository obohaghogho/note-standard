require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");

async function testProductsAndAccounts() {
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

  console.log("--- Checking Existing Accounts ---");
  try {
    const accs = await client.get("/accounts");
    console.log("Existing Accounts Response:", JSON.stringify(accs.data, null, 2));
  } catch (err) {
    console.error("GET /accounts failed:", err.message);
  }

  // Get existing customer ID
  const custRes = await client.get("/customers");
  const customers = custRes.data?.data || [];
  console.log(`Found ${customers.length} existing customers.`);
  if (customers.length === 0) return;

  const customerId = customers[0].id;
  const customerType = customers[0].type || "IndividualCustomer";
  console.log(`Using Customer ID: ${customerId}, Type: ${customerType}`);

  const productNamesToTest = ["DEFAULT_DEPOSIT", "SAVINGS", "CURRENT", "DEPOSIT", "INDIVIDUAL_DEPOSIT", "MAIN", "STANDARD"];

  for (const pName of productNamesToTest) {
    console.log(`\n--- Testing productName: "${pName}" ---`);
    const payload = {
      data: {
        type: "DepositAccount",
        attributes: {
          currency: "NGN",
          productName: pName,
        },
        relationships: {
          customer: {
            data: {
              type: customerType,
              id: customerId,
            },
          },
        },
      },
    };

    try {
      const res = await client.post("/accounts", payload);
      console.log(`✅ SUCCESS with productName "${pName}":`, JSON.stringify(res.data, null, 2));
      break;
    } catch (err) {
      console.log(`❌ Failed with productName "${pName}":`, err.response?.status, JSON.stringify(err.response?.data || err.message));
    }
  }
}

testProductsAndAccounts().catch(console.error);
