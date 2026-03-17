// test-auto-verify.js
require("dotenv").config({ path: ".env" });
const paymentService = require("./services/payment/paymentService");
const supabase = require("./config/database");

async function run() {
  console.log("Fetching latest pending Fincra transaction...");
  const { data: tx, error } = await supabase.from("transactions")
    .select("reference_id, amount, status")
    .eq("provider", "fincra")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
    
  if (error || !tx) {
    console.log("No pending transaction found.", error);
    process.exit(1);
  }
  
  console.log(`Testing verification for: ${tx.reference_id} | DB Amount: ${tx.amount} | Status: ${tx.status}`);
  
  try {
    const originalLog = console.error;
    let errLogs = "";
    console.error = (...args) => {
      errLogs += args.join(" ") + "\n";
      originalLog(...args);
    };
    
    // Simulate what the frontend does
    const result = await paymentService.verifyPaymentStatus(tx.reference_id);
    
    console.log("Final Retrieved Status:", result.status);
    console.log("Error Logs:", errLogs || "None");
  } catch (err) {
    console.error("Test completely failed", err);
  }
  process.exit(0);
}
run();
