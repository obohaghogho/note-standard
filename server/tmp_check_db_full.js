require("dotenv").config({ path: "./.env" });
const supabase = require("./config/database"); // Using the main database config
const fs = require("fs");

async function checkFullData() {
  try {
    const { data: profiles, error: pError } = await supabase.from("profiles").select("*").limit(5);
    if (pError) console.error("Profiles Error:", pError);

    const { data: subscriptions, error: sError } = await supabase.from("subscriptions").select("*").limit(5);
    if (sError) console.error("Subscriptions Error:", sError);

    const out = { profiles, subscriptions };
    fs.writeFileSync("db_detailed_check.json", JSON.stringify(out, null, 2));
    console.log("Done");
  } catch (err) {
    console.error(err);
  }
}

checkFullData().catch(console.error);
