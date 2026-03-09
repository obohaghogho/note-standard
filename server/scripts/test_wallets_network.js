require("dotenv").config({ path: __dirname + "/../.env" });
process.env.SUPABASE_URL = process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const supabase = require("../config/database");
const fs = require("fs");

async function applyRPC() {
  const sql = fs.readFileSync(
    __dirname + "/../database/migrations/109_fix_ambiguous_swap_id.sql",
    "utf8",
  );

  const { data, error } = await supabase.rpc("exec_sql", { sql });

  if (error) {
    console.log(
      "Cannot apply RPC via code. Need Supabase Dashboard SQL Editor.",
    );
  } else {
    console.log("Successfully applied RPC fix!");
  }
}

applyRPC();
