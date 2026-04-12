const crypto = require("crypto");
require("dotenv").config();

// Simulation of Fincra verification logic
function verifySignature(signature, payload, secret) {
    const hash = crypto.createHmac("sha512", secret)
        .update(payload)
        .digest("hex");
    return hash === signature;
}

const testSecret = "test_webhook_secret_123";
const testPayload = JSON.stringify({
    event: "charge.successful",
    data: { amount: 5000, reference: "NS_TEST_123" }
});

const generatedSignature = crypto.createHmac("sha512", testSecret)
    .update(testPayload)
    .digest("hex");

console.log("Generated Signature:", generatedSignature);
const isValid = verifySignature(generatedSignature, testPayload, testSecret);
console.log("Is Valid:", isValid);

if (isValid) {
    console.log("SUCCESS: Signature verification logic is correct.");
} else {
    console.log("ERROR: Signature verification logic failed.");
    process.exit(1);
}
