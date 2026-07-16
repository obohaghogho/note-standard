const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function investigateDuplicates() {
  const refs = [
    "294f6cb3-e042-448e-b95c-aa624b57ef29",
    "97357371-0f90-44da-9d65-032168ca7b6f",
    "481960ff-e7d1-4cd5-8e94-636d081390e4",
  ];

  console.log("--- INVESTIGATION: DUPLICATE TRANSACTION CHECK ---");

  for (const ref of refs) {
    const { data: txs, error } = await supabase
      .from("transactions")
      .select("*")
      .eq("id", ref);

    if (error) {
      console.error(`Error for Ref ${ref}:`, error.message);
      continue;
    }

    console.log(`Ref: ${ref} | Found ${txs.length} transaction(s)`);

    const { data: ledger, error: lError } = await supabase
      .from("ledger_entries")
      .select("*")
      .eq("reference", ref);

    console.log(`Ref: ${ref} | Found ${ledger.length} ledger entry(ies)`);
    if (ledger.length > 0) {
      ledger.forEach((l) =>
        console.log(
          `  Ledger ID: ${l.id}, Amount: ${l.amount}, Type: ${l.type}`,
        )
      );
    }
  }
}

investigateDuplicates();
