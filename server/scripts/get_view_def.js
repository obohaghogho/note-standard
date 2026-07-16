require("dotenv").config({ path: __dirname + "/../.env" });
process.env.SUPABASE_URL = process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL;

const supabase = require("../config/database");
const fs = require("fs");

async function getViewDef() {
  const { data, error } = await supabase.rpc("get_view_definition", {
    view_name: "wallets",
  });
  if (error) {
    // try querying postgres views directly if we have a pg function or just query information_schema
    const res = await supabase.from("views").select("*"); // This won't work easily via PostgREST
    fs.writeFileSync("C:/tmp/def.txt", JSON.stringify(error, null, 2));
  } else {
    fs.writeFileSync("C:/tmp/def.txt", JSON.stringify(data, null, 2));
  }
}

getViewDef();
