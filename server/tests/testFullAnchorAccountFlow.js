require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const anchorService = require("../services/anchorService");

async function testFullFlow() {
  console.log("================================================");
  console.log("  Testing Full Anchor Virtual Account Creation ");
  console.log("================================================");

  const testUserId = "00000000-0000-0000-0000-000000009999";
  const testEmail = `user_flow_${Date.now()}@notestandard.com`;

  try {
    const result = await anchorService.createVirtualAccount({
      userId: testUserId,
      email: testEmail,
      firstName: "Manuel",
      lastName: "Developer",
      phone: "2348012345678",
    });

    console.log("================================================");
    console.log("✅ FULL ANCHOR VIRTUAL ACCOUNT CREATION PASSED!");
    console.log("================================================");
    console.log("Account Result:", JSON.stringify(result, null, 2));
  } catch (err) {
    console.error("❌ Full Flow Error:", err.message);
    process.exit(1);
  }

  process.exit(0);
}

testFullFlow();
