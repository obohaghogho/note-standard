require('dotenv').config({ path: '../.env' });
const supabase = require('../config/database');
const supportService = require('../services/supportService');

async function testSupportPipeline() {
  console.log("=== AI Support Escalation Pipeline Test ===");

  // 1. Check Metrics
  console.log("Initial Metrics:", supportService.getMetrics());

  // 2. Fetch or create a test support conversation
  const { data: convs } = await supabase
    .from('conversations')
    .select('id, support_status')
    .eq('chat_type', 'support')
    .limit(1);

  let convId = convs?.[0]?.id;
  if (!convId) {
    console.log("Creating new test support conversation...");
    const { data: newConv } = await supabase
      .from('conversations')
      .insert([{ name: 'Test Support', chat_type: 'support', support_status: 'open' }])
      .select()
      .single();
    convId = newConv.id;
  }

  // Fetch test user
  const { data: profiles } = await supabase.from('profiles').select('id').limit(1);
  const userId = profiles?.[0]?.id || "00000000-0000-0000-0000-000000000001";
  const { data: adminProfiles } = await supabase.from('profiles').select('id').eq('plan_tier', 'admin').limit(1);
  const botSenderId = adminProfiles?.[0]?.id || userId;

  console.log(`Using Conv ID: ${convId} | User ID: ${userId} | Bot Sender ID: ${botSenderId}`);

  // 3. Test Priority Calculation Matrix
  console.log("\n--- Testing Priority Matrix ---");
  console.log("Fraud message priority:", supportService.calculatePriority("stolen card", "wallet"));
  console.log("Payment failure priority:", supportService.calculatePriority("transfer failed", "payment"));
  console.log("General question priority:", supportService.calculatePriority("how to change font", "ui"));

  // 4. Test User Message Processing with Escalation
  const escalateMsg = "My account is locked and payment of $500 failed! Please help immediately.";
  console.log(`\n--- Testing Escalation Processing for: "${escalateMsg}" ---`);

  const result = await supportService.handleUserSupportMessage(convId, escalateMsg, userId, botSenderId);
  console.log("Escalation Result:", result);

  // 5. Verify DB Persistence for Ticket and Conversation
  const { data: updatedConv } = await supabase
    .from('conversations')
    .select('support_status')
    .eq('id', convId)
    .single();

  console.log("Updated Conv support_status in DB:", updatedConv?.support_status);

  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('conversation_id', convId)
    .single();

  console.log("Created Support Ticket in DB:", ticket ? {
    id: ticket.id,
    priority: ticket.priority,
    category: ticket.category,
    reason: ticket.escalation_reason,
    assigned_admin: ticket.assigned_admin_id
  } : "No ticket found");

  // 6. Test GET /api/chat/support Payload Fetch
  console.log("\n--- Testing getSupportChatForUser ---");
  const userPayload = await supportService.getSupportChatForUser(userId);
  console.log("User Payload Keys:", Object.keys(userPayload || {}));
  console.log("Messages Count in Timeline:", userPayload?.messages?.length || 0);

  // 7. Test Race-Safe Claim Lock
  if (ticket) {
    console.log("\n--- Testing Race-Safe Ticket Claiming ---");
    const claimRes1 = await supportService.claimTicket(ticket.id, userId);
    console.log("Admin 1 Claim Result:", claimRes1);
  }

  console.log("\nFinal Metrics:", supportService.getMetrics());
  console.log("\n=== TEST COMPLETE ===");
}

testSupportPipeline().catch(console.error);
