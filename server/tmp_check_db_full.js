require("dotenv").config({ path: "./.env" });
const supabase = require("./config/database");

async function check() {
    console.log("Supabase URL:", process.env.SUPABASE_URL);
    
    // Check media_attachments table
    const { data: media, error: mediaErr } = await supabase
        .from("media_attachments")
        .select("*")
        .limit(1);
    console.log("media_attachments error status:", mediaErr ? mediaErr.message : "Success (table exists!)");

    // Check messages columns
    const { data: msg, error: msgErr } = await supabase
        .from("messages")
        .select("*")
        .limit(1);
    
    if (msgErr) {
        console.log("messages fetch error:", msgErr.message);
    } else if (msg && msg.length > 0) {
        console.log("messages columns:", Object.keys(msg[0]));
    } else {
        console.log("messages table is empty, columns cannot be listed this way.");
    }
}

check().catch(console.error);
