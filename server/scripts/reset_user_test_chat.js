const { createClient } = require('@supabase/supabase-js');
const env = require('../config/env');
const supportService = require('../services/supportService');

const serviceSupabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function testResetAndQuery() {
  const convId = '6f4f2d25-e236-4ac7-bc2f-46a6e6f69f22';
  const userId = '4697b099-c688-4e79-aebc-1649d101f42e'; // Stephen

  console.log(`Resetting conversation ${convId} to status='open'...`);
  await serviceSupabase
    .from('conversations')
    .update({ support_status: 'open', updated_at: new Date().toISOString() })
    .eq('id', convId);

  // Close any open tickets for this conversation so it is fully open
  await serviceSupabase
    .from('support_tickets')
    .update({ status: 'resolved' })
    .eq('conversation_id', convId);

  console.log("Testing Groq AI with query: 'where can I locate usd payment in these app?'...");

  const result = await supportService.handleUserSupportMessage(
    convId,
    "where can I locate usd payment in these app?",
    userId
  );

  console.log("\n=== RESULT FROM GROQ AI ===");
  console.log("Is Escalated:", result.isEscalated);
  console.log("Response Content:", result.message?.content);
}

testResetAndQuery().then(() => process.exit(0)).catch(err => {
  console.error("Error:", err);
  process.exit(1);
});
