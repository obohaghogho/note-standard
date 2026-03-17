// isolate-test.js
require("dotenv").config({ path: ".env" });
const supabase = require("./config/database");

async function run() {
  const reference = "tx_489a90c7bf3b4e08bb92526cc430c374";
  const { data: tx } = await supabase.from("transactions").select("*").eq("reference_id", reference).single();
  
  const evAmount = 39; // Scaled Fincra amount
  
  // Replication of PaymentService math.isEqual
  const math = require("./utils/mathUtils");
  
  console.log("DB Amount:", tx.amount, "Type:", typeof tx.amount);
  console.log("Fincra Amount:", evAmount, "Type:", typeof evAmount);
  
  const isEqual = math.isEqual(tx.amount, evAmount);
  console.log("Is Equal?", isEqual);
  
  if (!isEqual) {
    console.error("AMOUNT MISMATCH!");
  } else {
    console.log("AMOUNT MATCHES PERFECTLY");
  }
}

run();
