// test-verification.js
require("dotenv").config({ path: ".env" });
const PaymentFactory = require("./services/payment/PaymentFactory");
const fs = require("fs");

async function run() {
  const reference = "tx_489a90c7bf3b4e08bb92526cc430c374";
  console.log(`Directly Verifying with Fincra for: ${reference}`);
  try {
    const provider = PaymentFactory.getProviderByName("fincra");
    const result = await provider.verify(reference);
    fs.writeFileSync("output.json", JSON.stringify(result, null, 2));
    console.log("Written to output.json");
  } catch (error) {
    fs.writeFileSync("output.json", JSON.stringify({ error: error.message, stack: error.stack }, null, 2));
    console.log("Error written to output.json");
  }
  process.exit(0);
}

run();
