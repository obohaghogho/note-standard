const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function findValidAuthUser() {
  console.log(
    "Searching for a user that actually exists in auth.users by trying to create a dummy wallet...",
  );

  const { data: profiles, error: pError } = await supabase.from("profiles")
    .select("id").limit(50);
  if (pError) {
    console.error("Error fetching profiles:", pError);
    return;
  }

  for (const p of profiles) {
    // Try to create a dummy wallet for this user. If it fails with FK error, we skip.
    // Use an unlikely currency like 'TEST_TOKEN'
    const { error: wError } = await supabase.from("wallets_store").insert({
      user_id: p.id,
      currency: "TEST_TOKEN",
      network: "native",
      balance: 0,
      address: "test",
    });

    if (!wError) {
      console.log(`SUCCESS: Found valid user ID ${p.id}`);
      // Clean up
      await supabase.from("wallets_store").delete().eq("user_id", p.id).eq(
        "currency",
        "TEST_TOKEN",
      );
      return p.id;
    } else if (wError.code !== "23503") { // Foreign key violation is 23503
      console.log(`Other error for user ${p.id}: ${wError.message}`);
    }
  }

  console.log("No valid auth user found in the first 50 profiles.");
  return null;
}

findValidAuthUser().then((uid) => {
  if (uid) {
    console.log(`RESULT_ID: ${uid}`);
  }
});
