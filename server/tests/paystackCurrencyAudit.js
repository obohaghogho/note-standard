require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const axios = require("axios");

async function runPaystackAudit() {
  console.log("==========================================================================");
  console.log("  PAYSTACK LIVE SUPPORTED CURRENCY & SETTLEMENT QA AUDIT SUITE           ");
  console.log("==========================================================================");

  const secretKey = process.env.PAYSTACK_SECRET_KEY;

  if (!secretKey || secretKey === "sk_test_dummy_paystack_secret_key") {
    console.error("\n❌ CRITICAL: PAYSTACK_SECRET_KEY in server/.env is missing or set to dummy placeholder!");
    console.error("   Current Key:", secretKey);
    console.error("   Please set your live Paystack key (sk_live_...) in server/.env to complete live audit.");
    console.error("==========================================================================");
  }

  const client = axios.create({
    baseURL: "https://api.paystack.co",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    timeout: 10000,
  });

  const auditReport = {
    merchantName: "Unknown",
    businessId: "Unknown",
    environment: secretKey?.startsWith("sk_live_") ? "LIVE" : secretKey?.startsWith("sk_test_") ? "TEST" : "INVALID",
    defaultCurrency: "Unknown",
    settlementCurrency: "Unknown",
    currenciesTested: {},
    settlementAccounts: [],
    usdStatus: "Unknown",
    internationalStatus: "Unknown",
  };

  // --------------------------------------------------------------------------
  // STEP 1 & 2: API Credentials & Merchant Configuration
  // --------------------------------------------------------------------------
  console.log("\n[STEP 1 & 2] Verifying API Credentials & Merchant Information...");
  try {
    const balRes = await client.get("/balance");
    console.log("✅ Credentials Verified! HTTP 200 OK");
    console.log("   Balances Response:", JSON.stringify(balRes.data));
    if (balRes.data?.data) {
      const mainBal = balRes.data.data[0];
      auditReport.defaultCurrency = mainBal?.currency || "NGN";
    }
  } catch (err) {
    console.error("❌ Step 1/2 Error:", err.response?.status, JSON.stringify(err.response?.data || err.message));
  }

  // --------------------------------------------------------------------------
  // STEP 3: Settlement Accounts Audit
  // --------------------------------------------------------------------------
  console.log("\n[STEP 3] Auditing Settlement Accounts (Checking Zenith USD Domiciliary Account)...");
  try {
    const setRes = await client.get("/settlement");
    console.log("   Settlements Endpoint Response:", JSON.stringify(setRes.data));
    auditReport.settlementAccounts = setRes.data?.data || [];
  } catch (err) {
    console.log("⚠️ /settlement Endpoint Status:", err.response?.status, JSON.stringify(err.response?.data || err.message));
  }

  try {
    const subRes = await client.get("/subaccount");
    console.log("   Subaccounts Response:", JSON.stringify(subRes.data).substring(0, 300));
  } catch (err) {
    console.log("⚠️ /subaccount Status:", err.response?.status, JSON.stringify(err.response?.data || err.message));
  }

  // --------------------------------------------------------------------------
  // STEP 4: Currency Capability Test (Initialization Only)
  // --------------------------------------------------------------------------
  console.log("\n[STEP 4] Testing Currency Payment Initialization (NGN, USD, GHS, KES, ZAR)...");
  const currenciesToTest = [
    { code: "NGN", amount: 10000 }, // NGN 100.00
    { code: "USD", amount: 100 },   // USD 1.00
    { code: "GHS", amount: 100 },   // GHS 1.00
    { code: "KES", amount: 100 },   // KES 1.00
    { code: "ZAR", amount: 100 },   // ZAR 1.00
  ];

  for (const item of currenciesToTest) {
    console.log(`\n--- Testing Currency: [ ${item.code} ] ---`);
    const payload = {
      email: "qa_audit_test@notestandard.com",
      amount: item.amount,
      currency: item.code,
      reference: `qa_audit_${item.code}_${Date.now()}`,
      callback_url: "https://notestandard.com/wallet",
    };

    try {
      const res = await client.post("/transaction/initialize", payload);
      console.log(`✅ [${item.code}] SUCCESS! HTTP ${res.status}:`);
      console.log(`   Auth URL: ${res.data?.data?.authorization_url}`);
      auditReport.currenciesTested[item.code] = {
        supported: true,
        httpStatus: res.status,
        authUrl: res.data?.data?.authorization_url,
        message: res.data?.message || "Initialization Succeeded",
        raw: res.data,
      };
    } catch (err) {
      const status = err.response?.status;
      const data = err.response?.data;
      console.log(`❌ [${item.code}] FAILED! HTTP ${status}:`, JSON.stringify(data || err.message));
      auditReport.currenciesTested[item.code] = {
        supported: false,
        httpStatus: status,
        message: data?.message || err.message,
        code: data?.code || "rejected",
        raw: data,
      };
    }
  }

  // --------------------------------------------------------------------------
  // STEP 5: Summary Matrix Table
  // --------------------------------------------------------------------------
  console.log("\n==========================================================================");
  console.log("  STEP 5: PAYSTACK SUPPORTED CURRENCIES SUMMARY MATRIX                   ");
  console.log("==========================================================================");
  console.table(
    Object.keys(auditReport.currenciesTested).map((curr) => {
      const info = auditReport.currenciesTested[curr];
      return {
        Currency: curr,
        Supported: info.supported ? "YES ✅" : "NO ❌",
        HTTP_Status: info.httpStatus || "N/A",
        Reason: info.message,
      };
    })
  );

  console.log("\n==========================================================================");
  console.log("  AUDIT EXECUTION COMPLETE                                               ");
  console.log("==========================================================================");
}

runPaystackAudit();
