const path = require("path");
const crypto = require("crypto");
const axios = require("axios");

// 0. LOAD ENVIRONMENT VARIABLES
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

// 1. CONFIGURATION (Declared only once)
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const DEFAULT_WEBHOOK_URL = "https://notestandard.com/api/paystack/webhook";
const NGROK_URL =
  "https://nontrailing-superformally-dawson.ngrok-free.dev/api/paystack/webhook";

/**
 * RESOLVE WEBHOOK URL
 * Priority:
 * 1. process.env.WEBHOOK_URL
 * 2. Ngrok URL (for external testing)
 * 3. Fallback to Localhost
 */
const WEBHOOK_URL = process.env.WEBHOOK_URL || NGROK_URL || DEFAULT_WEBHOOK_URL;

// 2. VALIDATION
if (!PAYSTACK_SECRET) {
  console.error("\n❌ FATAL ERROR: PAYSTACK_SECRET_KEY not found in .env");
  console.error(
    "Please ensure server/.env contains: PAYSTACK_SECRET_KEY=sk_test_...",
  );
  process.exit(1);
}

// 3. PARSE ARGUMENTS
const args = process.argv.slice(2);
const testType = args[0] || "wallet"; // Default to wallet
const validTypes = ["wallet", "ad", "other"];

if (!validTypes.includes(testType)) {
  console.warn(
    `\n⚠️ Warning: "${testType}" is not a standard type. Using "wallet" instead.`,
  );
}

console.log("\n==========================================");
console.log(`🚀 PAYSTACK WEBHOOK SIMULATOR: ${testType.toUpperCase()}`);
console.log("==========================================");

// 4. CONSTRUCT PAYLOAD
// We generate a unique reference based on time to avoid idempotency conflicts
const reference = `TEST_${testType.toUpperCase()}_${Date.now()}`;
const amount = testType === "ad" ? 1500000 : 500000; // 15,000 NGN for ad, 5,000 NGN for wallet (in kobo)

const payload = {
  event: testType === "other" ? "transfer.success" : "charge.success",
  data: {
    id: Math.floor(Math.random() * 10000000),
    status: "success",
    reference: reference,
    amount: amount,
    currency: "NGN",
    paid_at: new Date().toISOString(),
    metadata: {
      userId: "5089c266-1ad6-4a83-b23f-064d65995345", // Replace with a real User ID if needed
      type: testType,
      adId: testType === "ad"
        ? "70dfd1da-285b-4352-8954-526487e47a9b"
        : undefined,
    },
    customer: {
      email: "simulation@notestandard.com",
      first_name: "Test",
      last_name: "Simulator",
    },
  },
};

// 5. GENERATE SIGNATURE (HMAC SHA512)
const signature = crypto.createHmac("sha512", PAYSTACK_SECRET)
  .update(JSON.stringify(payload))
  .digest("hex");

console.log(`📍 URL:       ${WEBHOOK_URL}`);
console.log(`🆔 REF:       ${reference}`);
console.log(`🔐 SIGNATURE: ${signature.substring(0, 16)}...`);
console.log("------------------------------------------");
console.log("📡 Sending request...");

// 6. DISPATCH REQUEST
axios.post(WEBHOOK_URL, payload, {
  headers: {
    "x-paystack-signature": signature,
    "Content-Type": "application/json",
  },
})
  .then((res) => {
    console.log("\n✅ SUCCESS!");
    console.log(`Status: ${res.status} ${res.statusText}`);
    console.log("Response:", JSON.stringify(res.data, null, 2));
    console.log(
      "\n👉 Check your server terminal/logs for the verification output.",
    );
  })
  .catch((err) => {
    console.error("\n❌ REQUEST FAILED");
    if (err.response) {
      console.error(`Status: ${err.response.status}`);
      console.error("Data:  ", err.response.data);

      if (err.response.status === 404) {
        console.error(
          "\n💡 HINT: ngrok 404 usually means your server is NOT running on port 5000 or the ngrok tunnel is pointing to the wrong port.",
        );
      } else if (err.response.status === 401) {
        console.error(
          "\n💡 HINT: 401 Unauthorized usually means the HMAC signature was rejected by your server.",
        );
      }
    } else {
      console.error("Error Code:", err.code);
      console.error("Message:   ", err.message);
      console.error(
        '\n💡 HINT: "ECONNREFUSED" means your server or ngrok tunnel is offline.',
      );
    }
  });
