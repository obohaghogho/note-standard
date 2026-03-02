const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function checkNegative() {
  console.log("--- DIANOSTIC: NEGATIVE BALANCE CHECK ---");

  try {
    const { data: negativeWallets, error } = await supabase
      .from("wallets")
      .select("*")
      .lt("balance", 0);

    if (error) {
      console.error("Error fetching wallets:", error.message);
      return;
    }

    if (!negativeWallets || negativeWallets.length === 0) {
      console.log("✅ No negative balances found. System is healthy.");
      return;
    }

    console.log(`❌ Found ${negativeWallets.length} negative wallet(s):`);
    for (const wallet of negativeWallets) {
      console.log(
        `\nWallet: ${wallet.currency} | ID: ${wallet.id} | User: ${wallet.user_id}`,
      );
      console.log(`Current Balance: ${wallet.balance}`);

      const { data: ledger, error: ledgerErr } = await supabase
        .from("ledger_entries")
        .select("*")
        .eq("wallet_id", wallet.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (ledgerErr) {
        console.error(`  Error fetching ledger:`, ledgerErr.message);
      } else {
        console.log(`  Audit Trail (Last 20 entries):`);
        ledger.forEach((entry) => {
          const sign = entry.amount >= 0 ? "+" : "";
          console.log(
            `    [${entry.created_at}] ${sign}${entry.amount} | Type: ${entry.type} | Status: ${entry.status} | Ref: ${entry.reference}`,
          );
        });
      }
    }
  } catch (e) {
    console.error("Unexpected script error:", e.message);
  }
}

checkNegative();
