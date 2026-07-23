require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const anchorService = require("../services/anchorService");
const supabase = require("../config/database");

async function testAnchorVirtualAccountRouteInternal() {
  console.log("================================================");
  console.log("  Testing Anchor Virtual Account Route Internals ");
  console.log("================================================");

  // 1. Fetch a real user from profiles table
  const { data: profiles, error: pErr } = await supabase.from("profiles").select("id, email, username").limit(1);
  if (pErr || !profiles || profiles.length === 0) {
    console.error("Could not fetch a real profile:", pErr?.message || "No profiles found");
    process.exit(1);
  }

  const realUser = profiles[0];
  console.log("Testing with real user from profiles:", realUser);

  try {
    const result = await anchorService.createVirtualAccount({
      userId: realUser.id,
      email: realUser.email || `${realUser.id}@notestandard.com`,
      firstName: realUser.username || "User",
      lastName: "Customer",
      phone: "2348012345678",
    });

    console.log("================================================");
    console.log("✅ VIRTUAL ACCOUNT CREATED AND SAVED TO DB!");
    console.log("================================================");
    console.log("Result:", JSON.stringify(result, null, 2));

    // Verify DB record in dedicated_accounts
    const { data: dva, error: dvaErr } = await supabase
      .from("dedicated_accounts")
      .select("*")
      .eq("user_id", realUser.id)
      .eq("provider", "anchor")
      .single();

    console.log("DB dedicated_accounts record:", dva);
  } catch (err) {
    console.error("❌ Route Internal Test Failed:", err.message);
    process.exit(1);
  }

  process.exit(0);
}

testAnchorVirtualAccountRouteInternal();
