require("dotenv").config({ path: "./server/.env" });
const supabase = require("./server/config/database");

async function diagnose() {
  try {
    console.log("--- Transactions Table Constraints ---");
    const { data: constraints, error: conError } = await supabase.rpc('get_table_constraints', { p_table_name: 'transactions' });
    if (conError) {
      console.log("RPC get_table_constraints failed (expected if not installed). Running alternative query via raw RPC if possible or checking migration history.");
    } else {
      console.log(constraints);
    }

    console.log("\n--- Commission Settings Details ---");
    const { data: settings, error: setError } = await supabase
      .from("commission_settings")
      .select("*");
    if (setError) throw setError;
    console.table(settings);

    console.log("\n--- Admin Settings (Fees) ---");
    const { data: admin, error: admError } = await supabase
      .from("admin_settings")
      .select("*");
    if (admError) throw admError;
    console.table(admin);

  } catch (err) {
    console.error("Diagnosis failed:", err);
  } finally {
    process.exit();
  }
}

diagnose();
