require('dotenv').config({ path: './server/.env' });
const supabase = require('./server/config/database');

async function checkMemberships() {
    console.log("Checking conversation_members...");
    const { data: convMembers, error: convErr } = await supabase.from('conversation_members').select('*').limit(5);
    console.log("Conversation Members (up to 5):", convMembers ? convMembers : "Error: " + JSON.stringify(convErr));

    console.log("\nChecking team_members...");
    const { data: teamMembers, error: teamErr } = await supabase.from('team_members').select('*').limit(5);
    console.log("Team Members (up to 5):", teamMembers ? teamMembers : "Error: " + JSON.stringify(teamErr));
}

checkMemberships();
