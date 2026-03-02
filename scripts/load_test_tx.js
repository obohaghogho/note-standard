const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");
const path = require("path");

// Load env from server directory
dotenv.config({ path: path.join(__dirname, "../server/.env") });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase URL or Service Key");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function generateFakeTransactions() {
  console.log("🚀 Starting Load Test: Generating 100+ Fake Transactions...");

  // 1. Get a test user (or specify one)
  const { data: profiles, error: pError } = await supabase.from("profiles")
    .select("id, email").limit(1);
  if (pError || !profiles.length) {
    console.error("No users found to test with.");
    return;
  }
  const user = profiles[0];
  console.log(`Using user: ${user.email} (${user.id})`);

  // 2. Get user wallets
  const { data: wallets, error: wError } = await supabase.from("wallets")
    .select("id, currency").eq("user_id", user.id);
  if (wError || !wallets.length) {
    console.error("No wallets found for user.");
    return;
  }
  const wallet = wallets[0];
  console.log(`Using wallet: ${wallet.currency} (${wallet.id})`);

  // 3. Insert 120 transactions
  const txs = [];
  for (let i = 1; i <= 120; i++) {
    txs.push({
      user_id: user.id,
      wallet_id: wallet.id,
      type: i % 2 === 0 ? "DEPOSIT" : "WITHDRAWAL",
      amount: Math.floor(Math.random() * 100) + 1,
      currency: wallet.currency,
      status: "COMPLETED",
      display_label: `Load Test Transaction #${i}`,
      description: "System generated for production readiness audit",
      metadata: { load_test: true, iteration: i },
    });
  }

  const { error: insertError } = await supabase.from("transactions").insert(
    txs,
  );

  if (insertError) {
    console.error("Failed to insert transactions:", insertError);
  } else {
    console.log(`✅ Success! Inserted 120 transactions for ${user.email}`);
    console.log(
      "Now check the dashboard or transactions page to verify pagination.",
    );
  }
}

generateFakeTransactions();
