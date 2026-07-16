require('dotenv').config();
const supabase = require("./config/database");

async function checkRecentMessages() {
  try {
    const { data: messages, error } = await supabase
      .from("messages")
      .select("id, content, type, attachment_id, reply_to_id, created_at")
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("Error fetching messages:", error);
      return;
    }

    console.log("RECENT MESSAGES:");
    console.log(JSON.stringify(messages, null, 2));

    const { data: attachments, error: attError } = await supabase
      .from("media_attachments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    if (attError) {
      console.error("Error fetching attachments:", attError);
    } else {
      console.log("RECENT ATTACHMENTS:");
      console.log(JSON.stringify(attachments, null, 2));
    }
  } catch (err) {
    console.error("Fatal error:", err);
  }
}

checkRecentMessages();
