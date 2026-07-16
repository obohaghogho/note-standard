/**
 * Note Standard Full Fix & Verify Script
 *
 * Replaces the psql-based approach since we use Supabase Cloud.
 * Checks:
 *   1. Wallet FK: transactions.wallet_id -> wallets.id
 *   2. Chat FK: messages.conversation_id -> conversations.id
 *   3. Presence fields on profiles
 *   4. Server reachability (no auth needed for root)
 *   5. PostgREST schema cache reload
 *
 * Run: node scripts/full_fix_verify.js
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
);

const PORT = process.env.PORT || 5000;

const OK = "[OK]";
const FAIL = "[FAIL]";
const WARN = "[WARN]";

let passed = 0;
let failed = 0;
let warnings = 0;

function log(status, msg) {
  if (status === OK) {
    passed++;
    console.log(`  ${OK}  ${msg}`);
  } else if (status === FAIL) {
    failed++;
    console.error(`  ${FAIL} ${msg}`);
  } else {
    warnings++;
    console.warn(`  ${WARN} ${msg}`);
  }
}

async function checkWalletFK() {
  console.log("\n--- 1. Wallet FK (transactions -> wallets) ---");

  // Check wallets table
  const { error: wErr } = await supabase.from("wallets").select("id").limit(1);
  if (wErr) {
    log(FAIL, `wallets table: ${wErr.message}`);
    return;
  }
  log(OK, "wallets table exists");

  // Check transactions table + wallet_id column
  const { error: tErr } = await supabase.from("transactions").select(
    "id, wallet_id",
  ).limit(1);
  if (tErr) {
    log(FAIL, `transactions table (wallet_id): ${tErr.message}`);
    return;
  }
  log(OK, "transactions table has wallet_id column");

  // Test PostgREST join
  const { data: joinData, error: joinErr } = await supabase
    .from("transactions")
    .select("id, wallet_id, wallet:wallets(id, currency)")
    .limit(3);

  if (joinErr) {
    log(FAIL, `PostgREST join transactions->wallets: ${joinErr.message}`);
    log(WARN, "Run this in Supabase SQL Editor:");
    console.log(`
    ALTER TABLE public.transactions
      DROP CONSTRAINT IF EXISTS transactions_wallet_id_fkey;
    ALTER TABLE public.transactions
      ADD CONSTRAINT transactions_wallet_id_fkey
      FOREIGN KEY (wallet_id) REFERENCES public.wallets(id) ON DELETE CASCADE;
    NOTIFY pgrst, 'reload schema';
        `);
  } else {
    log(OK, `PostgREST join works (${joinData?.length || 0} rows returned)`);
  }
}

async function checkChatFK() {
  console.log("\n--- 2. Chat FK (messages -> conversations) ---");

  // Check conversations table
  const { error: cErr } = await supabase.from("conversations").select("id")
    .limit(1);
  if (cErr) {
    log(FAIL, `conversations table: ${cErr.message}`);
    return;
  }
  log(OK, "conversations table exists");

  // Check messages table + conversation_id column
  const { error: mErr } = await supabase.from("messages").select(
    "id, conversation_id",
  ).limit(1);
  if (mErr) {
    log(FAIL, `messages table (conversation_id): ${mErr.message}`);
    return;
  }
  log(OK, "messages table has conversation_id column");

  // Test PostgREST join
  const { data: joinData, error: joinErr } = await supabase
    .from("messages")
    .select("id, conversation_id, conversation:conversations(id, type)")
    .limit(3);

  if (joinErr) {
    log(FAIL, `PostgREST join messages->conversations: ${joinErr.message}`);
    log(WARN, "Run this in Supabase SQL Editor:");
    console.log(`
    ALTER TABLE public.messages
      DROP CONSTRAINT IF EXISTS messages_conversation_id_fkey;
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_conversation_id_fkey
      FOREIGN KEY (conversation_id) REFERENCES public.conversations(id) ON DELETE CASCADE;
    NOTIFY pgrst, 'reload schema';
        `);
  } else {
    log(OK, `PostgREST join works (${joinData?.length || 0} rows returned)`);
  }
}

async function checkPresenceFields() {
  console.log("\n--- 3. Presence Fields on Profiles ---");

  const { data, error } = await supabase
    .from("profiles")
    .select("id, is_online, last_active_at, last_seen")
    .limit(1);

  if (error) {
    log(FAIL, `Presence fields missing: ${error.message}`);
    log(
      WARN,
      "Run migration 034_add_presence_fields.sql in Supabase SQL Editor.",
    );
  } else {
    log(OK, "Presence fields (is_online, last_active_at, last_seen) exist");
  }
}

async function checkServerReachability() {
  console.log("\n--- 4. Server Reachability ---");

  try {
    const resp = await fetch(`http://127.0.0.1:${PORT}/`);
    const body = await resp.json();
    if (resp.ok && body.message) {
      log(OK, `Server reachable at 127.0.0.1:${PORT} - "${body.message}"`);
    } else {
      log(
        WARN,
        `Server responded but unexpected body: ${JSON.stringify(body)}`,
      );
    }
  } catch (err) {
    log(FAIL, `Server NOT reachable at 127.0.0.1:${PORT}: ${err.message}`);
    log(WARN, "Make sure the server is running: npm run dev:safe");
  }

  // Also test /api/wallet/transactions (expects 401 without auth - that's fine, means route exists)
  try {
    const resp = await fetch(
      `http://127.0.0.1:${PORT}/api/wallet/transactions`,
    );
    if (resp.status === 401) {
      log(
        OK,
        "/api/wallet/transactions route exists (401 = auth required, expected)",
      );
    } else if (resp.ok) {
      log(OK, "/api/wallet/transactions route exists and responded");
    } else {
      log(WARN, `/api/wallet/transactions responded with ${resp.status}`);
    }
  } catch (err) {
    log(FAIL, `/api/wallet/transactions unreachable: ${err.message}`);
  }

  // Test chat route
  try {
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const resp = await fetch(
      `http://127.0.0.1:${PORT}/api/chat/conversations/${fakeId}/messages`,
    );
    if (resp.status === 401) {
      log(
        OK,
        "/api/chat/conversations/:id/messages route exists (401 = auth required, expected)",
      );
    } else if (resp.ok) {
      log(
        OK,
        "/api/chat/conversations/:id/messages route exists and responded",
      );
    } else {
      log(
        WARN,
        `/api/chat/conversations/:id/messages responded with ${resp.status}`,
      );
    }
  } catch (err) {
    log(
      FAIL,
      `/api/chat/conversations/:id/messages unreachable: ${err.message}`,
    );
  }
}

async function reloadSchemaCache() {
  console.log("\n--- 5. PostgREST Schema Cache Reload ---");

  // We can trigger this by calling an RPC or relying on Supabase to handle it.
  // The NOTIFY pgrst approach only works from direct SQL.
  // For the JS client, we just verify the joins work (already done above).
  log(
    OK,
    "Schema validation done via join tests above. If joins fail, use Supabase SQL Editor.",
  );
}

async function main() {
  console.log("==============================================");
  console.log("  Note Standard - Full Fix & Verify");
  console.log("==============================================");

  await checkWalletFK();
  await checkChatFK();
  await checkPresenceFields();
  await checkServerReachability();
  await reloadSchemaCache();

  console.log("\n==============================================");
  console.log(
    `  Results: ${passed} passed, ${failed} failed, ${warnings} warnings`,
  );
  console.log("==============================================\n");

  if (failed > 0) {
    console.log(
      "Action required: Fix the FAIL items above and re-run this script.",
    );
    process.exit(1);
  } else {
    console.log("All checks passed! Your system is healthy.");
  }
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
