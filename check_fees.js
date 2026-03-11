require("dotenv").config({ path: "./server/.env" });
const supabase = require("./server/config/database");

async function checkFees() {
  try {
    console.log("--- Commission Settings ---");
    const { data: commissions, error: comError } = await supabase
      .from("commission_settings")
      .select("*")
      .eq("is_active", true);
    
    if (comError) throw comError;
    commissions.forEach(c => {
      console.log(`${c.transaction_type}: ${c.value} ${c.commission_type} (Currency: ${c.currency || 'ALL'})`);
    });

    console.log("\n--- Admin Settings (Fees) ---");
    const { data: adminSettings, error: admError } = await supabase
      .from("admin_settings")
      .select("*")
      .in("key", ["funding_fee_percentage", "withdrawal_fee_percentage", "withdrawal_fee_flat", "spread_percentage"]);
    
    if (admError) throw admError;
    adminSettings.forEach(s => {
      console.log(`${s.key}: ${s.value}`);
    });

  } catch (err) {
    console.error("Error checking fees:", err);
  } finally {
    process.exit();
  }
}

checkFees();
