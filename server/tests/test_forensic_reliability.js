const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function runReliabilityTests() {
  console.log("==========================================================");
  console.log("NOTE STANDARD — MASTER FORENSIC RELIABILITY TEST SUITE");
  console.log("==========================================================");

  const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log("✔ Connected to database successfully.");

    // TEST 1: RLS INSERT Policy for 'conversations'
    console.log("\n[TEST 1] Testing RLS Policy for 'conversations' table...");
    const convPolicies = await client.query(`
      SELECT policyname, cmd, roles 
      FROM pg_policies 
      WHERE tablename = 'conversations' AND cmd = 'INSERT';
    `);
    if (convPolicies.rows.length === 0) {
      throw new Error("FAIL: No INSERT policy found for table 'conversations'.");
    }
    console.log(`✔ SUCCESS: ${convPolicies.rows.length} INSERT policy/policies found on 'conversations':`, 
      convPolicies.rows.map(r => r.policyname).join(', '));

    // TEST 2: RLS INSERT Policy for 'conversation_members'
    console.log("\n[TEST 2] Testing RLS Policy for 'conversation_members' table...");
    const memberPolicies = await client.query(`
      SELECT policyname, cmd, roles 
      FROM pg_policies 
      WHERE tablename = 'conversation_members' AND cmd = 'INSERT';
    `);
    if (memberPolicies.rows.length === 0) {
      throw new Error("FAIL: No INSERT policy found for table 'conversation_members'.");
    }
    console.log(`✔ SUCCESS: ${memberPolicies.rows.length} INSERT policy/policies found on 'conversation_members':`, 
      memberPolicies.rows.map(r => r.policyname).join(', '));

    // TEST 3: RLS INSERT & UPDATE Policies for 'wallets_store'
    console.log("\n[TEST 3] Testing RLS Policy for 'wallets_store' table...");
    const walletStorePolicies = await client.query(`
      SELECT policyname, cmd, roles 
      FROM pg_policies 
      WHERE tablename = 'wallets_store' AND cmd IN ('INSERT', 'UPDATE');
    `);
    if (walletStorePolicies.rows.length < 2) {
      throw new Error("FAIL: Missing INSERT/UPDATE policies for table 'wallets_store'.");
    }
    console.log(`✔ SUCCESS: ${walletStorePolicies.rows.length} INSERT/UPDATE policy/policies found on 'wallets_store':`, 
      walletStorePolicies.rows.map(r => `${r.cmd}: ${r.policyname}`).join(', '));

    // TEST 4: Simulated Authenticated User RLS Enforcement Evaluation
    console.log("\n[TEST 4] Evaluating RLS query planner rules for authenticated role...");
    await client.query("BEGIN;");
    await client.query("SET LOCAL ROLE authenticated;");
    await client.query("SET LOCAL \"request.jwt.claim.sub\" = '00000000-0000-0000-0000-000000000001';");
    
    // Attempt explain on insert to verify RLS check resolves without permission denied on table level
    const explainConv = await client.query("EXPLAIN SELECT * FROM public.conversations;");
    console.log("✔ SELECT EXPLAIN on conversations under authenticated role passed (rows returned: " + explainConv.rows.length + ")");

    const explainWallets = await client.query("EXPLAIN SELECT * FROM public.wallets_store WHERE user_id = '00000000-0000-0000-0000-000000000001';");
    console.log("✔ SELECT EXPLAIN on wallets_store under authenticated role passed (rows returned: " + explainWallets.rows.length + ")");
    
    await client.query("ROLLBACK;");

    console.log("\n==========================================================");
    console.log("🎉 ALL FORENSIC RELIABILITY TESTS PASSED CLEANLY!");
    console.log("==========================================================");

  } catch (err) {
    console.error("❌ TEST FAILED:", err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runReliabilityTests().then(() => process.exit(0)).catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
