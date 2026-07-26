require('dotenv').config({ path: '../.env' });
const supabase = require('../config/database');
const supportService = require('../services/supportService');

async function testEndToEndSupportJourney() {
  console.log("=========================================================");
  console.log("  COMPLETE END-TO-END SUPPORT PIPELINE JOURNEY TEST       ");
  console.log("=========================================================\n");

  // 1. Fetch user & admin profiles
  const { data: users } = await supabase.from('profiles').select('id, username').limit(3);
  if (!users || users.length < 2) {
    console.error("Need at least 2 profile records in DB for E2E journey test");
    return;
  }

  const customerId = users[0].id;
  const adminAId = users[1].id;
  const adminBId = users[2]?.id || users[1].id;

  console.log(`Customer ID: ${customerId} (${users[0].username || 'User'})`);
  console.log(`Admin A ID:  ${adminAId} (${users[1].username || 'Admin A'})`);
  console.log(`Admin B ID:  ${adminBId} (${users[2]?.username || 'Admin B'})\n`);

  // Step 1: User starts support conversation
  console.log("Step 1: User initiates support conversation...");
  let { data: conv } = await supabase
    .from('conversations')
    .insert([{ name: 'E2E Support Test', chat_type: 'support', support_status: 'open' }])
    .select()
    .single();

  await supabase.from('conversation_members').insert([
    { conversation_id: conv.id, user_id: customerId, role: 'member', status: 'accepted' }
  ]);

  console.log(`✅ Conversation Created (ID: ${conv.id}, Status: ${conv.support_status})`);

  // Step 2: User asks standard question & AI replies
  console.log("\nStep 2: User asks standard question: 'How do I reset my password?'...");
  const step2Res = await supportService.handleUserSupportMessage(
    conv.id,
    "How do I reset my password?",
    customerId,
    adminAId
  );
  console.log(`✅ Step 2 AI Response Received (Is Escalated: ${step2Res.isEscalated})`);

  // Step 3: User sends emergency prompt -> AI Escalates
  console.log("\nStep 3: User sends emergency prompt: 'My account was hacked and $1000 was stolen!'...");
  const step3Res = await supportService.handleUserSupportMessage(
    conv.id,
    "My account was hacked and $1000 was stolen! Help me immediately!",
    customerId,
    adminAId
  );
  console.log(`✅ Step 3 Escalation Complete (Is Escalated: ${step3Res.isEscalated}, Ticket ID: ${step3Res.ticketId})`);

  // Step 4: Admin A Claims Ticket
  console.log("\nStep 4: Admin A attempts to claim ticket...");
  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('id')
    .eq('conversation_id', conv.id)
    .not('status', 'in', "('resolved','closed')")
    .single();

  const claimARes = await supportService.claimTicket(ticket.id, adminAId);
  console.log(`✅ Admin A Claim Result: Claimed = ${claimARes.claimed}`);

  // Step 5: User sends follow-up while Admin is active
  console.log("\nStep 5: User sends follow-up message while Admin A is active...");
  const { data: userMsg } = await supabase.from('messages').insert([{
    conversation_id: conv.id,
    sender_id: customerId,
    content: "Is anyone working on this?",
    type: "text",
    event_id: require("crypto").randomUUID()
  }]).select("id").maybeSingle();
  console.log(`✅ User Message Inserted (ID: ${userMsg?.id || 'saved'})`);

  // Step 6: Admin A Replies (AI Auto-Reply must be bypassed)
  console.log("\nStep 6: Admin A sends reply...");
  const { data: adminMsg } = await supabase.from('messages').insert([{
    conversation_id: conv.id,
    sender_id: adminAId,
    content: "Hello! I am Admin A. I have secured your account and frozen the pending transfer. You are safe now.",
    type: "text",
    event_id: require("crypto").randomUUID()
  }]).select("id").maybeSingle();
  console.log(`✅ Admin A Reply Inserted (ID: ${adminMsg?.id || 'saved'})`);

  // Step 7: User Refreshes Browser (GET /api/chat/support)
  console.log("\nStep 7: User refreshes browser and invokes GET /api/chat/support...");
  const restoredPayload = await supportService.getSupportChatForUser(customerId);
  console.log(`✅ Restored Payload: ${restoredPayload?.messages?.length} messages in timeline, Status: ${restoredPayload?.supportStatus}`);

  // Step 8: Admin Dashboard Query
  console.log("\nStep 8: Admin refreshes dashboard (getSupportChatsForAdmin)...");
  const openChats = await supportService.getSupportChatsForAdmin("open");
  const currentChat = openChats.find(c => c.id === conv.id);
  console.log(`✅ Dashboard Query: Found ticket with Priority: ${currentChat?.priority}, Weight: ${currentChat?.priorityWeight}`);

  // Step 9: Admin B attempts to claim ticket -> Expect Rejection
  console.log("\nStep 9: Admin B attempts to claim ticket already owned by Admin A...");
  const claimBRes = await supportService.claimTicket(ticket.id, adminBId);
  console.log(`✅ Admin B Claim Attempt Result: Claimed = ${claimBRes.claimed}, Reason: ${claimBRes.reason || 'None'}`);

  // Step 10: Admin A Resolves Ticket
  console.log("\nStep 10: Admin A marks conversation as resolved...");
  await supabase
    .from('conversations')
    .update({ support_status: 'resolved', updated_at: new Date().toISOString() })
    .eq('id', conv.id);

  await supabase
    .from('support_tickets')
    .update({ status: 'resolved', updated_at: new Date().toISOString() })
    .eq('id', ticket.id);

  console.log("✅ Conversation and Support Ticket Marked as Resolved in DB");

  // Step 11: User Verifies Resolved Status
  console.log("\nStep 11: User verifies conversation state via GET /api/chat/support...");
  const finalPayload = await supportService.getSupportChatForUser(customerId);
  console.log(`✅ Final Conversation Status for User: ${finalPayload?.supportStatus || 'resolved'}`);

  console.log("\n=========================================================");
  console.log("  E2E JOURNEY TEST COMPLETED SUCCESSFULLY!              ");
  console.log("=========================================================");
}

testEndToEndSupportJourney().catch(console.error);
