require('dotenv').config({ path: './server/.env' });
const supabase = require('./server/config/database');

async function checkDatabase() {
    console.log("Checking conversations...");
    const { data: convs, error: convErr } = await supabase.from('conversations').select('*').limit(5);
    console.log("Conversations Count (up to 5):", convs ? convs.length : "Error: " + JSON.stringify(convErr));

    console.log("Checking messages...");
    const { data: msgs, error: msgErr } = await supabase.from('messages').select('*').limit(5);
    console.log("Messages Count (up to 5):", msgs ? msgs.length : "Error: " + JSON.stringify(msgErr));

    console.log("Checking teams...");
    const { data: teams, error: teamErr } = await supabase.from('teams').select('*').limit(5);
    console.log("Teams Count (up to 5):", teams ? teams.length : "Error: " + JSON.stringify(teamErr));
}

checkDatabase();
