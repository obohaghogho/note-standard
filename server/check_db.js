require("dotenv").config({ path: "./.env" });
const supabase = require("./config/supabase");

const fs = require("fs");

async function checkData() {
  const { data: profiles } = await supabase.from("profiles").select(
    "id, username, email, role",
  );
  const { data: settings } = await supabase.from("admin_settings").select("*");

  const out = { profiles, settings };
  fs.writeFileSync("db_check_results.json", JSON.stringify(out, null, 2));
  console.log("Done");
}

checkData().catch(console.error);
