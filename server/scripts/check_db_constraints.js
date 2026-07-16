const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function checkConstraints() {
  const { data, error } = await supabase.rpc("run_query", {
    query:
      "SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.wallets_store'::regclass;",
  });

  if (error) {
    console.error("Error:", error.message);
    return;
  }

  console.log(JSON.stringify(data, null, 2));
}

checkConstraints().catch(console.error);
