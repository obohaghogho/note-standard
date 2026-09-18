const supabase = require("../config/database");
const supportService = require("../services/supportService");

async function verifyRepair() {
  console.log("=== VERIFYING SUPPORT CHAT REPAIR ===");
  const convId = "c53fd624-0d9b-4479-a7f5-b064fef186a4";
  const williamId = "587b4497-1ab9-4293-b986-d60e0d1422d9";
  const adminId = "5089c266-1ad6-4a83-b23f-064d65995345";

  // 1. Check conversation record
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, name, type, chat_type, support_status")
    .eq("id", convId)
    .single();

  console.log("\n1. Conversation record:", conv || convErr);

  // 2. Check support ticket
  const { data: ticket, error: ticketErr } = await supabase
    .from("support_tickets")
    .select("*")
    .eq("conversation_id", convId);

  console.log("\n2. Support ticket:", ticket || ticketErr);

  // 3. Check remaining messages (ensure test messages deleted, real ones intact)
  const { data: messages, error: msgErr } = await supabase
    .from("messages")
    .select("id, sender_id, content, created_at")
    .eq("conversation_id", convId)
    .order("created_at", { ascending: false });

  console.log(`\n3. Total messages in conv: ${messages ? messages.length : 0}`);
  if (messages && messages.length > 0) {
    console.log("Latest message:", messages[0]);
    console.log("Earliest message:", messages[messages.length - 1]);
  }

  // 4. Test William's Support Payload (getSupportChatForUser)
  console.log("\n4. Testing William's support chat payload (getSupportChatForUser)...");
  try {
    const userPayload = await supportService.getSupportChatForUser(williamId);
    console.log("User Payload Success:", {
      convId: userPayload?.conversation?.id,
      chatType: userPayload?.conversation?.chat_type,
      messageCount: userPayload?.messages?.length,
      ticketId: userPayload?.ticket?.id,
      assignedAdmin: userPayload?.assignedAdmin?.id
    });
  } catch (e) {
    console.error("User Payload Error:", e.message);
  }

  // 5. Test Admin's Support Chats (getSupportChatsForAdmin)
  console.log("\n5. Testing Admin's support chat list (getSupportChatsForAdmin)...");
  try {
    const adminChats = await supportService.getSupportChatsForAdmin();
    const williamConvInAdmin = (adminChats || []).find(c => c.id === convId);
    console.log("Admin Support List Success:", {
      totalSupportChats: adminChats?.length,
      foundWilliamChat: !!williamConvInAdmin,
      ticketPriority: williamConvInAdmin?.priority,
      lastMsg: williamConvInAdmin?.lastMessage?.content
    });
  } catch (e) {
    console.error("Admin Support List Error:", e.message);
  }

  process.exit(0);
}

verifyRepair().catch(err => {
  console.error("Verification failed:", err);
  process.exit(1);
});
