const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function checkWalletConstraints() {
  console.log("--- DIAGNOSTIC: WALLET CONSTRAINT CHECK ---");

  const { data, error } = await supabase.rpc("run_query", {
    query: `
        SELECT conname, contype 
        FROM pg_constraint 
        WHERE conrelid = 'public.wallets_store'::regclass;
    `,
  });

  if (error) {
    console.error("Query failed:", error.message);
    return;
  }
  console.log("Constraints found:", JSON.stringify(data, null, 2));
}

checkWalletConstraints();
