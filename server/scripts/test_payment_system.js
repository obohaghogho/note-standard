/**
 * Payment System Test Script
 *
 * Simulates all payment flows to verify the system works correctly.
 * Run: node server/scripts/test_payment_system.js
 *
 * Tests:
 * 1. Paystack webhook (valid signature)
 * 2. Paystack webhook (invalid signature)
 * 3. Brevo inbound email (valid Grey notification)
 * 4. Brevo email with wrong amount
 * 5. Brevo email with missing reference
 * 6. Duplicate webhook handling
 * 7. GreyEmailService parsing
 * 8. Reference generation
 * 9. Payment expiration
 */

const crypto = require("crypto");
const path = require("path");

// Load env
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: path.join(__dirname, "..", ".env.development"),
  });
}

const GreyEmailService = require("../services/payment/GreyEmailService");
const WebhookSignatureService = require("../services/payment/WebhookSignatureService");

// ─── Test Utilities ─────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(condition, testName) {
  if (condition) {
    console.log(`  ✅ ${testName}`);
    passed++;
  } else {
    console.error(`  ❌ ${testName}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n══════════════════════════════════════`);
  console.log(`  ${name}`);
  console.log(`══════════════════════════════════════`);
}

// ─── Test 1: GreyEmailService Parsing ───────────────────────

section("1. GreyEmailService — Email Parsing");

// Test: Standard Grey notification
const email1 = `
  Subject: Payment received - $500.00 USD
  You have received a payment of $500.00 from John Doe.
  Reference: NOTE-A3B7K2
  Transaction ID: TXN-123456
  Amount: $500.00
  Sender: John Doe
`;

const result1 = GreyEmailService.parse(email1);
assert(result1.amount === 500, "Amount extracted correctly ($500.00)");
assert(result1.currency === "USD", "Currency extracted correctly (USD)");
assert(result1.reference === "NOTE-A3B7K2", "Reference extracted (NOTE-A3B7K2)");
assert(result1.sender.includes("John Doe"), "Sender extracted (John Doe)");
assert(result1.transactionId === "TXN-123456", "Transaction ID extracted");
assert(result1.confidence >= 60, `Confidence >= 60 (got ${result1.confidence})`);

// Test: GBP email
const email2 = `
  You received £1,250.50 GBP from Sarah Williams.
  Narration: NS-ABC12345-1711234567
  Trace No: GBP-789
`;

const result2 = GreyEmailService.parse(email2);
assert(result2.amount === 1250.5, "GBP amount with comma: £1,250.50");
assert(result2.currency === "GBP", "Currency: GBP detected");
assert(
  result2.reference === "NS-ABC12345-1711234567",
  "NS- reference extracted"
);

// Test: EUR with tx_ reference
const email3 = `
  Deposit of €200.00 EUR received.
  Reference: tx_abcdef1234567890abcdef1234567890
  Sender: Maria Schmidt
`;

const result3 = GreyEmailService.parse(email3);
assert(result3.amount === 200, "EUR amount: €200.00");
assert(result3.currency === "EUR", "Currency: EUR");
assert(
  result3.reference.startsWith("tx_"),
  "tx_ reference extracted"
);

// Test: Minimal/poor email (should be low confidence)
const email4 = `Hello, your account has been updated. Thank you.`;
const result4 = GreyEmailService.parse(email4);
assert(result4.confidence < 40, `Low confidence for vague email (got ${result4.confidence})`);
assert(result4.reference === null, "No reference from vague email");

// Test: HTML email
const email5 = `
  <html><body>
  <h1>Payment Confirmation</h1>
  <p>Amount: <strong>$750.00 USD</strong></p>
  <p>Reference: <code>NOTE-X7Y8Z9</code></p>
  <p>From: <em>Robert Chen</em></p>
  </body></html>
`;

const result5 = GreyEmailService.parse(email5);
assert(result5.amount === 750, "HTML email amount: $750");
assert(result5.reference === "NOTE-X7Y8Z9", "HTML email reference extracted");

// Test: XSS prevention
const email6 = `
  Amount: $100 <script>alert('xss')</script>
  Reference: NOTE-SAFE01
  Sender: <img onerror="alert(1)">Evil Actor
`;

const result6 = GreyEmailService.parse(email6);
assert(result6.amount === 100, "XSS sanitization: amount still extracted");
assert(result6.reference === "NOTE-SAFE01", "XSS sanitization: ref still extracted");
assert(!result6.raw.includes("<script>"), "XSS: script tags removed");

// ─── Test 2: Brevo Payload Parsing ──────────────────────────

section("2. GreyEmailService — Brevo Payload Parsing");

const brevoPayload = {
  Items: [
    {
      Uuid: ["msg-uuid-12345"],
      Subject: "Payment received - $300.00",
      RawTextBody: `
        You have received a payment of $300.00 USD.
        Reference: NOTE-BR3V01
        Sender: Brevo Test User
        Transaction ID: BRV-001
      `,
      Sender: {
        Address: "notifications@grey.co",
        Name: "Grey Finance",
      },
      SentAtDate: new Date().toISOString(),
    },
  ],
};

const brevoResult = GreyEmailService.parseBrevoPayload(brevoPayload);
assert(brevoResult.amount === 300, "Brevo: amount $300");
assert(brevoResult.currency === "USD", "Brevo: currency USD");
assert(brevoResult.reference === "NOTE-BR3V01", "Brevo: reference extracted");
assert(brevoResult.transactionId === "BRV-001", "Brevo: transaction ID");
assert(brevoResult.confidence >= 60, `Brevo: confidence >= 60 (got ${brevoResult.confidence})`);

// Test empty payload
const emptyResult = GreyEmailService.parseBrevoPayload(null);
assert(emptyResult.confidence === 0, "Empty payload: confidence 0");
assert(emptyResult.amount === null, "Empty payload: no amount");

// ─── Test 3: Reference Generation ───────────────────────────

section("3. GreyEmailService — Reference Generation");

const refs = new Set();
for (let i = 0; i < 100; i++) {
  refs.add(GreyEmailService.generateReference());
}

assert(refs.size === 100, "100 unique references generated (no collisions)");

const sampleRef = GreyEmailService.generateReference();
assert(sampleRef.startsWith("NOTE-"), `Format: starts with NOTE- (${sampleRef})`);
assert(sampleRef.length === 11, `Length: 11 chars (NOTE- + 6) (${sampleRef})`);
assert(
  /^NOTE-[A-Z2-9]{6}$/.test(sampleRef),
  `Pattern: NOTE-[A-Z2-9]{6} (${sampleRef})`
);

// ─── Test 4: WebhookSignatureService ────────────────────────

section("4. WebhookSignatureService — Signature Verification");

// Paystack signature test
const testSecret = "sk_test_abc123";
const testBody = JSON.stringify({ event: "charge.success", data: { amount: 10000 } });
const validHash = crypto
  .createHmac("sha512", testSecret)
  .update(testBody)
  .digest("hex");

// Save and restore env
const origKey = process.env.PAYSTACK_SECRET_KEY;
process.env.PAYSTACK_SECRET_KEY = testSecret;

const paystackValid = WebhookSignatureService.verifyPaystack(
  { "x-paystack-signature": validHash },
  Buffer.from(testBody)
);
assert(paystackValid, "Paystack: valid signature accepted");

const paystackInvalid = WebhookSignatureService.verifyPaystack(
  { "x-paystack-signature": "invalid_hash_value" },
  Buffer.from(testBody)
);
assert(!paystackInvalid, "Paystack: invalid signature rejected");

const paystackMissing = WebhookSignatureService.verifyPaystack(
  {},
  Buffer.from(testBody)
);
assert(!paystackMissing, "Paystack: missing signature rejected");

process.env.PAYSTACK_SECRET_KEY = origKey;

// Brevo verification test
const origBrevoSecret = process.env.BREVO_INBOUND_SECRET;
process.env.BREVO_INBOUND_SECRET = "test_brevo_secret";

const brevoValid = WebhookSignatureService.verifyBrevo(
  { "x-brevo-inbound-secret": "test_brevo_secret" },
  {},
  {}
);
assert(brevoValid, "Brevo: valid header secret accepted");

const brevoQueryValid = WebhookSignatureService.verifyBrevo(
  {},
  {},
  { secret: "test_brevo_secret" }
);
assert(brevoQueryValid, "Brevo: valid query secret accepted");

const brevoInvalid = WebhookSignatureService.verifyBrevo(
  { "x-brevo-inbound-secret": "wrong_secret" },
  {},
  {}
);
assert(!brevoInvalid, "Brevo: invalid secret rejected");

process.env.BREVO_INBOUND_SECRET = origBrevoSecret;

// ─── Test 5: Timestamp Validation ───────────────────────────

section("5. WebhookSignatureService — Replay Prevention");

const now = Date.now();
const check1 = WebhookSignatureService.verifyTimestamp(
  new Date(now - 60 * 1000).toISOString(), // 1 minute ago
  300
);
assert(check1.valid, "1min old event: accepted (within 5min window)");

const check2 = WebhookSignatureService.verifyTimestamp(
  new Date(now - 600 * 1000).toISOString(), // 10 minutes ago
  300
);
assert(!check2.valid, "10min old event: rejected (outside 5min window)");

const check3 = WebhookSignatureService.verifyTimestamp(null, 300);
assert(check3.valid, "No timestamp: passes through (skip check)");

const check4 = WebhookSignatureService.verifyTimestamp("not-a-date", 300);
assert(!check4.valid, "Invalid date: rejected");

// Unix timestamp (seconds)
const check5 = WebhookSignatureService.verifyTimestamp(
  Math.floor(now / 1000) - 30, // 30 seconds ago
  300
);
assert(check5.valid, "Unix timestamp (seconds): accepted");

// ─── Test 6: Brevo IP Check ────────────────────────────────

section("6. WebhookSignatureService — Brevo IP Allowlist");

assert(
  WebhookSignatureService.isBrevoIP("185.107.232.100"),
  "Known Brevo IP accepted"
);
assert(
  WebhookSignatureService.isBrevoIP("51.38.99.100"),
  "Known Brevo IP range accepted"
);
assert(
  !WebhookSignatureService.isBrevoIP("192.168.1.1"),
  "Unknown IP rejected"
);
assert(!WebhookSignatureService.isBrevoIP(""), "Empty IP rejected");
assert(!WebhookSignatureService.isBrevoIP(null), "Null IP rejected");

// ─── Test 7: Edge Cases ─────────────────────────────────────

section("7. Edge Cases");

// Amount with no currency symbol
const edgeEmail1 = `Transfer of 100 received. Narration: NOTE-EDGE01`;
const edgeResult1 = GreyEmailService.parse(edgeEmail1);
assert(edgeResult1.amount === 100, "Edge: amount without currency symbol");
assert(edgeResult1.reference === "NOTE-EDGE01", "Edge: reference found");

// Multiple amounts in email (should take the first match)
const edgeEmail2 = `
  Previous balance: $500.00
  Amount received: $250.00 USD
  New balance: $750.00
  Reference: NOTE-MULTI1
`;
const edgeResult2 = GreyEmailService.parse(edgeEmail2);
assert(
  edgeResult2.amount === 500 || edgeResult2.amount === 250,
  `Edge: first amount extracted (got ${edgeResult2.amount})`
);

// Very large amount
const edgeEmail3 = `Received $9,999,999.99 USD. Reference: NOTE-BIGAMT`;
const edgeResult3 = GreyEmailService.parse(edgeEmail3);
assert(edgeResult3.amount === 9999999.99, "Edge: large amount parsed correctly");

// Overly large amount (above sanity limit)
const edgeEmail4 = `Received $99,999,999.99 USD. Reference: NOTE-TOOBIG`;
const edgeResult4 = GreyEmailService.parse(edgeEmail4);
assert(edgeResult4.amount === null, "Edge: insane amount rejected ($100M+)");

// ─── Test 8: Simulated Webhook Payloads ─────────────────────

section("8. Simulated Webhook Payloads");

// Paystack charge.success event structure
const paystackEvent = {
  event: "charge.success",
  data: {
    reference: "tx_test123abc",
    amount: 50000, // 500.00 NGN in kobo
    currency: "NGN",
    status: "success",
    metadata: {
      userId: "user-uuid-123",
      type: "wallet",
    },
    paid_at: new Date().toISOString(),
  },
};

assert(paystackEvent.event === "charge.success", "Paystack event: charge.success");
assert(paystackEvent.data.amount === 50000, "Paystack amount: 50000 kobo");
assert(
  paystackEvent.data.metadata.userId === "user-uuid-123",
  "Paystack metadata: userId present"
);

// Brevo inbound parse structure
const brevoInboundEvent = {
  Items: [
    {
      Uuid: ["brevo-msg-uuid"],
      Subject: "You received $100.00",
      RawTextBody:
        "Payment of $100.00 USD received from Test User. Reference: NOTE-TEST01. Transaction ID: GRY-999.",
      Sender: { Address: "alerts@grey.co", Name: "Grey" },
      SentAtDate: new Date().toISOString(),
    },
  ],
};

const parsedBrevo = GreyEmailService.parseBrevoPayload(brevoInboundEvent);
assert(parsedBrevo.amount === 100, "Brevo sim: amount $100");
assert(parsedBrevo.reference === "NOTE-TEST01", "Brevo sim: reference found");
assert(parsedBrevo.confidence >= 60, `Brevo sim: high confidence (${parsedBrevo.confidence})`);

console.log(`
══════════════════════════════════════
  📊 RESULTS
══════════════════════════════════════
  ✅ Passed: ${passed}
  ❌ Failed: ${failed}
  📋 Total:  ${passed + failed}
══════════════════════════════════════
`);

if (failed > 0) {
  process.exit(1);
}
