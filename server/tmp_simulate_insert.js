require('dotenv').config();
const supabase = require("./config/database");

async function simulateInsert() {
  try {
    const insertPayload = {
      conversation_id: "4c4650c0-2ed9-4355-9185-16394cd32136",
      sender_id: "5089c266-1ad6-4a83-b23f-064d65995345",
      content: "Simulation test with attachment",
      type: "audio",
      attachment_id: "8bec2e7c-a99c-4498-9817-58da2d3697bf"
    };

    const { data, error } = await supabase
      .from("messages")
      .insert([insertPayload])
      .select("*, attachment:media_attachments(*), sender:profiles!sender_id(id, username, full_name, avatar_url), reply_to:messages(id, content, sender_id)")
      .single();

    if (error) {
      console.log("INSERT FAILED!");
      console.log("Error Code:", error.code);
      console.log("Error Message:", error.message);
      console.log("Error Details:", error.details);
    } else {
      console.log("INSERT SUCCEEDED!");
      console.log(data);
    }
  } catch (err) {
    console.error("Fatal error:", err);
  }
}

simulateInsert();
