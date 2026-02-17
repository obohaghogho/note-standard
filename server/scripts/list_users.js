const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const supabase = require(path.join(__dirname, "..", "config", "supabase"));

async function listUsers() {
  const { data: profiles } = await supabase.from("profiles").select(
    "id, username, role",
  );
  console.log(JSON.stringify(profiles, null, 2));
}

listUsers();
