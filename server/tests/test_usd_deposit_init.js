const { v4: uuidv4 } = require("uuid");
const supabase = require("../config/database");
const paymentService = require("../services/payment/paymentService");

async function testUsdDepositInit() {
  console.log("--- Starting USD Deposit Transfer Initialization Audit ---");

  // Fetch an existing real profile from DB
  const { data: realProfile } = await supabase
    .from("profiles")
    .select("id, email, username")
    .limit(1)
    .single();

  if (!realProfile) {
    console.error("❌ No real profile found in DB to test");
    process.exit(1);
  }

  const testUserId = realProfile.id;
  const testEmail = realProfile.email || "user@notestandard.com";
  console.log(`Using real profile: ${testUserId} (${testEmail})`);


  try {
    // 2. Initialize USD Payment via paymentService (Grey provider)
    console.log("Initializing USD payment via PaymentService...");
    const result = await paymentService.initializePayment(
      testUserId,
      testEmail,
      100,
      "USD",
      {
        channel: "bank_transfer",
        method: "bank_transfer",
        customerName: "USD Audit User"
      },
      { provider: "grey" }
    );

    console.log("✅ USD Deposit Initialization Output:", {
      reference: result.reference,
      provider: result.provider,
      status: result.status
    });

    // 3. Verify wallet created in wallets_store
    const { data: wallet } = await supabase
      .from("wallets_store")
      .select("*")
      .eq("user_id", testUserId)
      .eq("currency", "USD")
      .maybeSingle();

    if (wallet && wallet.id) {
      console.log(`✅ USD Wallet successfully created in wallets_store: ID=${wallet.id}, Address=${wallet.address}`);
    } else {
      console.error("❌ FAIL: USD Wallet missing in wallets_store!");
      process.exit(1);
    }

    // Cleanup test transaction only
    if (result && result.reference) {
      await supabase.from("transactions").delete().eq("reference_id", result.reference);
    }
    console.log("✅ Test audit complete.");
    process.exit(0);
  } catch (err) {
    console.error("❌ TEST EXCEPTION:", err.message, err.stack);
    process.exit(1);
  }
}

testUsdDepositInit();
