// test-verification-full.js
require("dotenv").config({ path: ".env" });
const paymentService = require("./services/payment/paymentService");
const fs = require("fs");

async function run() {
  const reference = process.argv[2] || "tx_666db86c0afe40a48fb3bf7712b8345b";
  console.log(`Starting full verification flow for: ${reference}`);
  try {
    const originalLog = console.error;
    let errLogs = "";
    console.error = (...args) => {
      errLogs += args.join(" ") + "\n";
      originalLog(...args);
    };
    
    const result = await paymentService.verifyPaymentStatus(reference);
    
    fs.writeFileSync("output-logs.json", JSON.stringify({
      finalStatus: result.status,
      errorLogs: errLogs,
      result
    }, null, 2));
    
  } catch (error) {
    fs.writeFileSync("output-logs.json", JSON.stringify({ error: error.message }, null, 2));
  }
  process.exit(0);
}

run();
