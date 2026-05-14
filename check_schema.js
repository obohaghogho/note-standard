require('dotenv').config({ path: './server/.env' });
const supabase = require('./server/config/database');

async function checkSchema() {
    console.log("Checking conversation_members columns...");
    // Try querying the columns
    const { data, error } = await supabase
        .from("conversation_members")
        .select("conversation_id, role, status")
        .limit(1);

    if (error) {
        console.log("Query failed with error:", error);
    } else {
        console.log("Query succeeded! Data:", data);
    }
}

checkSchema();
