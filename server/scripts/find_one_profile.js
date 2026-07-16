const { createClient } = require("@supabase/supabase-js");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../.env") });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function findOneProfile() {
  const { data, error } = await supabase.from("profiles").select("id, email")
    .limit(1);
  if (error) {
    console.error(error);
  } else {
    console.log(JSON.stringify(data[0]));
  }
}

findOneProfile();
