require('dotenv').config({ path: './server/.env' });
const supabase = require('./server/config/database');

async function checkClearedAt() {
    console.log("Checking if members have cleared_at set...");
    const { data: convMembers, error: convErr } = await supabase
        .from('conversation_members')
        .select('user_id, conversation_id, cleared_at')
        .not('cleared_at', 'is', null)
        .limit(10);
    
    console.log("Members with cleared_at set:", convMembers ? convMembers : "Error: " + JSON.stringify(convErr));
}

checkClearedAt();
