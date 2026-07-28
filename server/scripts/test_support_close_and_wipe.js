const supabase = require("../config/database");
const aiSupportService = require("../services/aiSupportService");
const supportService = require("../services/supportService");

async function runPhysicalTest() {
  console.log("=== STARTING PHYSICAL TEST FOR AI SUPPORT CHAT CLOSE & WIPE ===");

  // 1. Fetch or create a test user ID
  const { data: users, error: userErr } = await supabase
    .from("profiles")
    .select("id, username")
    .limit(1);

  if (userErr || !users || users.length === 0) {
    console.error("Test error: No profile found to test with");
    process.exit(1);
  }

  const testUserId = users[0].id;
  console.log(`Using test profile ID: ${testUserId} (${users[0].username})`);

  // 2. Fetch or create support conversation
  let supportData = await supportService.getSupportChatForUser(testUserId);
  let convId = supportData?.conversation?.id;

  if (!convId) {
    const { data: newC, error: cErr } = await supabase
      .from("conversations")
      .insert([{ name: "Support Chat", chat_type: "support", support_status: "open" }])
      .select()
      .single();

    if (cErr) throw cErr;
    convId = newC.id;

    await supabase.from("conversation_members").insert([
      { conversation_id: convId, user_id: testUserId, role: "member", status: "accepted" }
    ]);
  }

  console.log(`Support conversation ID: ${convId}`);

  // 3. Insert test messages to simulate conversation history
  await supabase.from("messages").insert([
    { conversation_id: convId, sender_id: testUserId, content: "How do I add a Zenith Bank NUBAN?", type: "text" },
    { conversation_id: convId, sender_id: "00000000-0000-0000-0000-000000000000", content: "You can generate a Zenith NUBAN in your Wallet page under Virtual Account.", type: "text", sender_type: "ai" }
  ]);

  console.log("Inserted test messages into conversation.");

  // Check message count
  let { count: msgCountBefore } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", convId);

  console.log(`Message count before closing: ${msgCountBefore}`);

  // 4. Simulate user sending close command: "Thanks, please close chat"
  console.log("\n--- Testing AI Close Intent Detection ---");
  const aiResult = await aiSupportService.processSupportMessage(
    convId,
    "Thanks, please close chat",
    testUserId,
    "00000000-0000-0000-0000-000000000000"
  );

  console.log("AI Result Output:", aiResult);

  // Check conversation status after AI close intent
  const { data: convAfterClose } = await supabase
    .from("conversations")
    .select("support_status")
    .eq("id", convId)
    .single();

  console.log(`Conversation support_status after close intent: '${convAfterClose?.support_status}'`);

  if (convAfterClose?.support_status !== "resolved") {
    console.error("FAILED: support_status was not updated to 'resolved'!");
    process.exit(1);
  }

  // 5. Test opening support chat AGAIN after resolution -> Previous messages MUST be wiped clean!
  console.log("\n--- Testing Message Wiping on Reopening Support ---");
  const reopenedSupport = await supportService.getSupportChatForUser(testUserId);

  console.log(`Reopened supportStatus: '${reopenedSupport?.supportStatus}'`);
  console.log(`Reopened message count: ${reopenedSupport?.messages?.length}`);

  let { count: msgCountAfter } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", convId);

  console.log(`DB Message count after wiping: ${msgCountAfter}`);

  if (msgCountAfter === 0 && reopenedSupport?.messages?.length === 0 && reopenedSupport?.supportStatus === "open") {
    console.log("\n SUCCESS: Previous message history was successfully wiped clean and fresh support session initialized!");
  } else {
    console.error("\n FAILED: Messages were not wiped!");
    process.exit(1);
  }

  process.exit(0);
}

runPhysicalTest().catch(err => {
  console.error("Physical Test Error:", err);
  process.exit(1);
});
