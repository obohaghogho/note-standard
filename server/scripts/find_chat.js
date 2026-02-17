const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });
const supabase = require(path.join(__dirname, "..", "config", "supabase"));

async function findActiveChat() {
  const { data: members } = await supabase.from("conversation_members").select(
    "conversation_id",
  );
  const counts = {};
  members.forEach((m) => {
    counts[m.conversation_id] = (counts[m.conversation_id] || 0) + 1;
  });

  for (const id in counts) {
    if (counts[id] >= 2) {
      console.log(`Conversation ${id} has ${counts[id]} members.`);
    }
  }
}

findActiveChat();
