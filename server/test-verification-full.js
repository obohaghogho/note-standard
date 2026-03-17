// test-verification-full.js
require("dotenv").config({ path: ".env" });
const paymentService = require("./services/payment/paymentService");
const fs = require("fs");

async function run() {
  const reference = "tx_489a90c7bf3b4e08bb92526cc430c374";
  console.log(`Starting full verfication flow for: ${reference}`);
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
