require('dotenv').config();
const { checkDailyLimit } = require("./utils/limitCheck");
const supabase = require("./config/database");

async function runTest() {
  console.log("--- Starting Custom Limit Test ---");

  // 1. Find a test user
  const { data: profile, error: pError } = await supabase.from("profiles").select("id, email, plan_tier, daily_deposit_limit").eq("email", "onome.john.test@gmail.com").maybeSingle();
  if (pError || !profile) {
    console.error("No profile found to test with:", pError?.message || "Not found");
    return;
  }

  console.log(`Testing with user: ${profile.email} (Plan: ${profile.plan_tier}, Custom Limit: ${profile.daily_deposit_limit})`);

  // 2. Test initial state (assuming no limit set yet)
  console.log("\nScenario 1: Default Plan Limit");
  const res1 = await checkDailyLimit(profile.id, profile.plan_tier || "FREE", 10);
  console.log(`Result: Limit=${res1.limit}, Allowed=${res1.allowed}, Used=${res1.totalUsed}`);

  // 3. Set a temporary custom limit
  const TEST_LIMIT = 555;
  console.log(`\nScenario 2: Setting Custom Limit to ${TEST_LIMIT}`);
  await supabase.from("profiles").update({ daily_deposit_limit: TEST_LIMIT }).eq("id", profile.id);

  const res2 = await checkDailyLimit(profile.id, profile.plan || "FREE", 10);
  console.log(`Result: Limit=${res2.limit}, Allowed=${res2.allowed}, Used=${res2.totalUsed}`);

  if (res2.limit === TEST_LIMIT) {
    console.log("SUCCESS: Custom limit was recognized!");
  } else {
    console.error(`FAILURE: Expected limit ${TEST_LIMIT}, but got ${res2.limit}`);
  }

  // 4. Cleanup (Set back to NULL)
  console.log("\nCleaning up...");
  await supabase.from("profiles").update({ daily_deposit_limit: null }).eq("id", profile.id);
  console.log("Cleanup complete.");
}

runTest().catch(console.error);
