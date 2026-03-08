/**
 * Manual Wallet Credit Test
 * Run: node scripts/test_wallet_credit.js
 *
 * This script tests:
 * 1. Can we find the user's wallet?
 * 2. Can we credit the wallet using confirm_deposit RPC?
 * 3. Are there any schema/column issues?
 */

require("dotenv").config({ path: __dirname + "/../.env" });
process.env.SUPABASE_URL = process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const supabase = require("../config/database");

const TEST_USER_ID = "8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd";
const TEST_AMOUNT = 0.01; // Small test credit
const TEST_CURRENCY = "USD";

async function runTest() {
  console.log("=== LISTING DATABASE TRIGGERS ===\n");
  const { data, error } = await supabase.rpc("exec_sql", {
    query: `
      SELECT 
        event_object_table AS table_name, 
        trigger_name, 
        action_statement 
      FROM information_schema.triggers 
      WHERE trigger_schema = 'public' 
      AND event_object_table IN ('transactions', 'wallets_store', 'ledger_entries');
    `,
  });

  if (error) {
    console.error("RPC exec_sql failed, trying direct query if possible...");
    // Supabase JS client doesn't natively support raw queries without RPC.
    // If exec_sql doesn't exist, we can't easily query information_schema.
    console.dir(error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}
runTest();
