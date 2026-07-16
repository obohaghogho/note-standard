const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const GreyProvider = require("../services/payment/providers/GreyProvider");
const GreyEmailService = require("../services/payment/GreyEmailService");
const logger = require("../utils/logger");

async function deepTestGrey() {
  console.log("--- GREY PROVIDER DEEP TEST (PRODUCTION READINESS) ---");
  const provider = new GreyProvider();

  // 1. Test Initialization for all supported currencies
  const currencies = ["USD", "EUR", "GBP"];
  for (const curr of currencies) {
    console.log(`\nTesting Initialization for ${curr}...`);
    try {
      const result = await provider.initialize({
        currency: curr,
        amount: 50,
        reference: "MANUAL_TEST_" + curr + "_" + Date.now(),
        metadata: { user_id: "test-user-id" }
      });

      console.log(`✅ ${curr} Init Success`);
      console.log(`  Bank: ${result.instructions.bank_name}`);
      console.log(`  Account: ${result.instructions.account_number}`);
      console.log(`  Reference: ${result.instructions.reference}`);
    } catch (e) {
      console.error(`❌ ${curr} Init Failed: ${e.message}`);
    }
  }

  // 2. Test Email Parsing (The most critical part of Grey integration)
  console.log("\n--- TESTING EMAIL PARSER ---");
  const sampleEmailBody = `
    Hello tejiri jude oboh,
    
    You have received a new payment of 100.00 USD.
    
    Details:
    Sender: John Doe
    Reference: NS-TEST-1234
    Status: Successful
    
    Regards,
    Grey.
  `;

  try {
    const parsed = GreyEmailService.parse(sampleEmailBody);
    console.log("✅ Email Parsed Successfully");
    console.log("  Extracted Amount:", parsed.amount);
    console.log("  Extracted Currency:", parsed.currency);
    console.log("  Extracted Reference:", parsed.reference);
    
    if (parsed.amount === 100 && parsed.currency === "USD" && parsed.reference === "NS-TEST-1234") {
        console.log("  ✅ Logic Validation: SUCCESS");
    } else {
        console.log("  ❌ Logic Validation: FAILED (Data mismatch)");
    }
  } catch (e) {
    console.error("❌ Email Parsing Failed:", e.message);
  }

  // 3. Test Reference Generation
  console.log("\n--- TESTING REFERENCE GENERATION ---");
  const userId = "7cf5f5b2-a48b-45d1-afdf-72e9b67d7b92";
  const ref = GreyEmailService.generateReference(userId);
  console.log(`Generated Reference: ${ref}`);
  if (ref.startsWith("NOTE-")) {
      console.log("✅ Reference Format: VALID");
  } else {
      console.log("❌ Reference Format: INVALID");
  }
}

deepTestGrey();
