require("dotenv").config({ path: __dirname + "/../.env" });
process.env.SUPABASE_URL = process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const supabase = require("../config/database");

async function checkWallets() {
  console.log("--- Checking wallets_store ---");
  let { data: store } = await supabase.from("wallets_store").select("*");
  console.log("wallets_store rows:", store.length);

  console.log("--- Checking wallets view ---");
  let { data: view } = await supabase.from("wallets").select("*");
  console.log("wallets view rows:", view.length);
  if (store.length > view.length) {
    console.log("The view is filtering out rows!");
  }
}
checkWallets();
