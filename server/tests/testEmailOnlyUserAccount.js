require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const anchorService = require("../services/anchorService");

async function testEmailOnlyUserAccount() {
  console.log("================================================");
  console.log("  Testing Email-Only User Virtual Account Flow  ");
  console.log("================================================");

  const testUserId = `user_no_phone_${Date.now()}`;
  const testEmail = `email_only_${Date.now()}@notestandard.com`;

  try {
    const result = await anchorService.createVirtualAccount({
      userId: testUserId,
      email: testEmail,
      firstName: "EmailOnly",
      lastName: "User",
      phone: null, // NO PHONE NUMBER
    });

    console.log("================================================");
    console.log("✅ EMAIL-ONLY USER ACCOUNT CREATION SUCCESSFUL!");
    console.log("================================================");
    console.log("Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("❌ Email-Only Test Failed:", err.message);
    process.exit(1);
  }

  process.exit(0);
}

testEmailOnlyUserAccount();
