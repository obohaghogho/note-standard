const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function syncBalances() {
  console.log("--- SYNCING ALL WALLET BALANCES (Repairing Desync) ---");

  // Fetch all wallets
  const { data: wallets, error: fetchError } = await supabase
    .from("wallets_store")
    .select("id, user_id, currency, balance, available_balance");

  if (fetchError) {
    console.error("Error fetching wallets:", fetchError.message);
    return;
  }

  const desynced = wallets.filter((w) => {
    const bal = parseFloat(w.balance || 0);
    const avail = parseFloat(w.available_balance || 0);
    // If available is significantly less than balance
    return bal > 0 && avail < bal * 0.999;
  });

  if (!desynced || desynced.length === 0) {
    console.log(
      "No significantly desynced wallets found. System might be healthy.",
    );
    return;
  }

  console.log(
    `Found ${desynced.length} potentially desynced wallets. Checking for pending transactions...`,
  );

  for (const wallet of desynced) {
    // Check for pending withdrawals or swaps for this specific wallet
    const { data: pending, error: pendingError } = await supabase
      .from("transactions")
      .select("id")
      .eq("wallet_id", wallet.id)
      .eq("status", "PENDING");

    if (pendingError) {
      console.error(
        `Error checking pending for wallet ${wallet.id}:`,
        pendingError.message,
      );
      continue;
    }

    if (pending && pending.length > 0) {
      console.log(
        `Wallet ${wallet.id} (${wallet.currency}) has ${pending.length} pending transactions. Skipping sync to avoid double-spend.`,
      );
      continue;
    }

    console.log(
      `Repairing ${wallet.currency} wallet for user ${wallet.user_id}...`,
    );
    const { error: updateError } = await supabase
      .from("wallets_store")
      .update({ available_balance: wallet.balance })
      .eq("id", wallet.id);

    if (updateError) {
      console.error(
        `Failed to repair wallet ${wallet.id}:`,
        updateError.message,
      );
    } else {
      console.log(
        `Successfully repaired wallet ${wallet.id}. balance = available_balance = ${wallet.balance}`,
      );
    }
  }

  console.log("--- REPAIR COMPLETE ---");
}

syncBalances().catch(console.error);
