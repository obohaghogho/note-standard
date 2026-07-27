require('dotenv').config({ path: '../.env' });
const supabase = require('../config/database');
const supportService = require('../services/supportService');

async function runProductionVerifications() {
  console.log("=================================================");
  console.log("  AI SUPPORT ESCALATION PRODUCTION VERIFICATION  ");
  console.log("=================================================\n");

  // ── TEST 1: TRANSACTION BOUNDARIES & ENRICHED API PAYLOAD ──────────────────
  console.log("--- TEST 1: Verification of Transaction Boundaries & API Payload ---");
  const { data: testUsers } = await supabase.from('profiles').select('id').limit(2);

  // Find or create test conversation
  let { data: conv } = await supabase
    .from('conversations')
    .select('id')
    .eq('chat_type', 'support')
    .limit(1)
    .maybeSingle();

  if (!conv) {
    const { data: newC } = await supabase.from('conversations').insert([{ name: 'Stress Test Support', chat_type: 'support', support_status: 'open' }]).select().single();
    conv = newC;
  }

  const convId = conv.id;
  
  // Get real member user_id from conversation_members
  const { data: memberData } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', convId)
    .limit(1);

  const userId = memberData?.[0]?.user_id || testUsers?.[0]?.id || "00000000-0000-0000-0000-000000000001";
  const adminId1 = testUsers?.[0]?.id || userId;
  const adminId2 = testUsers?.[1]?.id || userId;

  console.log(`Using Conv ID: ${convId} | Real User ID: ${userId}`);

  // Execute atomic escalation via supportService
  const result = await supportService.handleUserSupportMessage(
    convId,
    "Emergency: Fraudulent transaction detected on my virtual account!",
    userId,
    adminId1
  );

  console.log("Single Escalation Result:", {
    isEscalated: result.isEscalated,
    ticketId: result.ticketId,
    latencyMs: result.latencyMs
  });

  // Verify DB state
  const { data: dbConv } = await supabase.from('conversations').select('support_status').eq('id', convId).single();
  const { data: dbTickets } = await supabase.from('support_tickets').select('id, status, priority, category, escalation_reason').eq('conversation_id', convId);

  console.log("DB Conversation Status:", dbConv?.support_status);
  console.log("DB Tickets Count for Conv:", dbTickets?.length || 0);
  console.log("Active Ticket Details:", dbTickets?.[0]);

  // ── TEST 2: IDEMPOTENCY UNDER CONCURRENT LOAD ──────────────────────────────
  console.log("\n--- TEST 2: Idempotency Under Load (Rapid Concurrent Escalations) ---");
  const loadMessage = "My wallet balance is missing and payment failed! Help!";

  // Fire 5 rapid parallel message executions to simulate rapid user clicking / network retries
  const loadPromises = [1, 2, 3, 4, 5].map(i =>
    supportService.handleUserSupportMessage(convId, `${loadMessage} (Burst #${i})`, userId, adminId1)
  );

  const loadResults = await Promise.allSettled(loadPromises);
  console.log(`Executed 5 rapid concurrent requests. Settled count: ${loadResults.length}`);

  // Re-check total tickets in DB for this conversation
  const { data: postLoadTickets } = await supabase
    .from('support_tickets')
    .select('id, status, priority')
    .eq('conversation_id', convId)
    .not('status', 'in', "('resolved','closed')");

  console.log(`Post-load active tickets count in DB: ${postLoadTickets?.length} (Expected: exactly 1)`);
  if (postLoadTickets?.length === 1) {
    console.log("✅ Idempotency Verified: Exactly 1 active ticket exists despite 5 rapid concurrent queries!");
  } else {
    console.warn("⚠️ Idempotency Check: Found multiple tickets:", postLoadTickets);
  }

  // ── TEST 3: SIMULTANEOUS ADMIN CLAIM RACE CONDITION ────────────────────────
  if (postLoadTickets?.[0]?.id) {
    const ticketId = postLoadTickets[0].id;
    console.log(`\n--- TEST 3: Simultaneous Admin Claims Race Condition on Ticket ${ticketId} ---`);

    // Reset claim state
    await supabase.from('support_tickets').update({ assigned_admin_id: null, claimed_at: null, claim_expires_at: null, status: 'open' }).eq('id', ticketId);

    // Fire 2 simultaneous claim requests for Admin 1 and Admin 2
    const claimPromise1 = supportService.claimTicket(ticketId, adminId1);
    const claimPromise2 = supportService.claimTicket(ticketId, adminId2);

    const [claim1, claim2] = await Promise.all([claimPromise1, claimPromise2]);

    console.log("Admin 1 Claim Result:", claim1);
    console.log("Admin 2 Claim Result:", claim2);

    const successCount = [claim1, claim2].filter(c => c.claimed === true).length;
    console.log(`Successful Claims Count: ${successCount} (Expected: exactly 1)`);

    if (successCount === 1) {
      console.log("✅ Race-Free Claim Lock Verified: Only 1 admin successfully claimed the ticket!");
    } else {
      console.warn("⚠️ Claim Lock Check: Unexpected success count:", successCount);
    }
  }

  // ── TEST 4: RECONNECT SYNCHRONIZATION & GET /api/chat/support ──────────────
  console.log("\n--- TEST 4: Reconnect Synchronization & Payload Fetch ---");
  const userPayload = await supportService.getSupportChatForUser(userId);
  console.log("Restored Support Payload:", {
    hasConversation: !!userPayload?.conversation,
    supportStatus: userPayload?.supportStatus,
    messagesCount: userPayload?.messages?.length || 0,
    hasTicket: !!userPayload?.ticket,
    hasAssignedAdmin: !!userPayload?.assignedAdmin,
    unreadCount: userPayload?.unreadCount
  });

  if (userPayload?.conversation && userPayload?.messages?.length > 0) {
    console.log("✅ Reconnect State Recovery Verified: Full timeline and conversation state restored!");
  }

  // ── TEST 5: METRICS ────────────────────────────────────────────────────────
  console.log("\n--- TEST 5: Production Operational Metrics ---");
  console.log("Support Metrics Output:", supportService.getMetrics());

  console.log("\n=================================================");
  console.log("  ALL PRODUCTION VERIFICATIONS COMPLETED         ");
  console.log("=================================================");
}

runProductionVerifications().catch(console.error);
