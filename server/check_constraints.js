const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function checkConstraints() {
  console.log("--- DIAGNOSTIC: CONSTRAINT CHECK ---");

  // Check for the unique_ledger_entry constraint
  const { data, error } = await supabase.rpc("get_table_constraints", {
    p_table_name: "ledger_entries",
  });

  if (error) {
    // If the helper RPC doesn't exist, try a direct query
    console.log("Helper RPC failed, trying direct catalog query...");
    const { data: catalogData, error: catalogError } = await supabase.rpc(
      "run_query",
      {
        query: `
            SELECT conname, contype 
            FROM pg_constraint 
            WHERE conrelid = 'public.ledger_entries'::regclass;
        `,
      },
    );

    if (catalogError) {
      console.error("Catalog query failed:", catalogError.message);
      return;
    }
    console.log("Constraints found:", catalogData);
  } else {
    console.log("Constraints found:", data);
  }
}

checkConstraints();
