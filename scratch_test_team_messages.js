const supabase = require("./server/config/database");

async function check() {
  const { data, error } = await supabase
    .from('team_messages')
    .select('*, profiles:sender_id(*)')
    .limit(1);
    
  console.log("Error:", error);
  if (data && data.length > 0) {
    console.log("Keys:", Object.keys(data[0]));
  } else {
    console.log("No data");
  }
}
check();
