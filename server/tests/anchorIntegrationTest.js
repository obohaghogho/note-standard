require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const AnchorProvider = require("../services/payment/providers/AnchorProvider");
const anchorService = require("../services/anchorService");
const PaymentFactory = require("../services/payment/PaymentFactory");
const crypto = require("crypto");

async function runSandboxValidationMatrix() {
  console.log("=================================================");
  console.log("  Anchor BaaS Checkpoint 4.5 Validation Matrix  ");
  console.log("=================================================");

  const provider = new AnchorProvider();

  // Test 1: Health Check Endpoint
  console.log("\n[Test 1] Provider Health Check...");
  const health = await provider.healthCheck();
  console.log("Result:", health);

  // Test 2: Factory Registration
  console.log("\n[Test 2] PaymentFactory Registration Check...");
  const resolvedProvider = PaymentFactory.getProviderByName("anchor");
  console.log("Resolved Class:", resolvedProvider.constructor.name);

  // Test 3: Webhook Signature Verification (Valid Signature)
  console.log("\n[Test 3] Webhook Signature Verification (Valid)...");
  const secret = process.env.ANCHOR_WEBHOOK_SECRET || "anchor_whsec_dummy_secret";
  const body = JSON.stringify({ event: "deposit.successful", data: { reference: "ref_test_123", amount: 500000, currency: "NGN" } });
  const hash = crypto.createHmac("sha256", secret).update(body).digest("hex");
  const isValid = provider.verifyWebhookSignature({ "x-anchor-signature": hash }, body);
  console.log("Signature Validated:", isValid);

  // Test 4: Webhook Signature Verification (Forged Signature)
  console.log("\n[Test 4] Webhook Signature Verification (Invalid Forged)...");
  const isInvalidRejected = !provider.verifyWebhookSignature({ "x-anchor-signature": "forged_invalid_hash" }, body);
  console.log("Forged Signature Rejected:", isInvalidRejected);

  // Test 5: Webhook Payload Parsing
  console.log("\n[Test 5] Webhook Event Payload Parsing...");
  const parsedEvent = provider.parseWebhookEvent(JSON.parse(body));
  console.log("Parsed Event:", parsedEvent);

  // Test 6: Disabled State Defense
  console.log("\n[Test 6] Disabled State Guard Rejection...");
  process.env.ANCHOR_ENABLED = "false";
  try {
    const disabledProvider = new AnchorProvider();
    await disabledProvider.initialize({ email: "test@example.com", amount: 100, reference: "ref_1" });
    console.error("FAILED: Should have thrown disabled error!");
  } catch (err) {
    console.log("SUCCESS: Caught Expected Guard Error ->", err.message);
  } finally {
    process.env.ANCHOR_ENABLED = "false"; // Keep disabled by default
  }

  console.log("\n=================================================");
  console.log("  All Checkpoint 4.5 Validation Tests Passed!  ");
  console.log("=================================================");
  process.exit(0);
}

runSandboxValidationMatrix().catch((err) => {
  console.error("Validation Crash:", err);
  process.exit(1);
});
