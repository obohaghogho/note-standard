require("dotenv").config();
const supabase = require("../config/database");

async function inspectFincraTransactions() {
  console.log("=================================================");
  console.log(" 🔍 INSPECTING LIVE FINCRA TRANSACTIONS TABLE");
  console.log("=================================================");

  try {
    const { data: txs, error } = await supabase
      .from("fincra_transactions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.error("Supabase Query Error:", error);
      return;
    }

    console.log(`Found ${txs.length} recent transactions:\n`);
    for (const tx of txs) {
      console.log("-------------------------------------------------");
      console.log(`Reference:        ${tx.reference}`);
      console.log(`Fincra Ref:       ${tx.fincra_reference}`);
      console.log(`User ID:          ${tx.user_id}`);
      console.log(`Amount:           ${tx.gross_amount} ${tx.currency}`);
      console.log(`Fee:              ${tx.fee}`);
      console.log(`Status:           ${tx.status}`);
      console.log(`Error Code:       ${tx.error_code}`);
      console.log(`Error Message:    ${tx.error_message}`);
      console.log(`Created At:       ${tx.created_at}`);
      console.log(`Updated At:       ${tx.updated_at}`);
    }
  } catch (err) {
    console.error("Execution error:", err.message);
  }

  console.log("=================================================");
}

inspectFincraTransactions();
