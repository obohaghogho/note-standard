const supabase = require("./config/supabase");
async function check() {
  const { data, error } = await supabase.from("commission_settings").select(
    "count",
  ).limit(1);
  if (error) {
    console.error("Table check error:", error);
  } else {
    console.log("Table exists, row count check:", data);
  }
  process.exit();
}
check();
