require('dotenv').config({ path: '../.env' });
const supabase = require('../config/database');
const aiSupportService = require('../services/aiSupportService');

async function test() {
  console.log("GROQ API KEY present:", !!process.env.GROQ_API_KEY);
  console.log("Service Configuration Status:", aiSupportService.isConfigured());

  // 1. Fetch latest support conversation
  const { data: convs, error: convErr } = await supabase
    .from('conversations')
    .select('*')
    .eq('chat_type', 'support')
    .order('created_at', { ascending: false })
    .limit(1);

  if (convErr || !convs || convs.length === 0) {
    console.log("No support conversations found in DB.");
    return;
  }

  const conv = convs[0];
  console.log("Found Support Conversation ID:", conv.id, "| Status:", conv.support_status, "| Type:", conv.chat_type);

  // 2. Fetch a member to mock user
  const { data: members } = await supabase
    .from('conversation_members')
    .select('user_id')
    .eq('conversation_id', conv.id)
    .limit(1);

  if (!members || members.length === 0) {
     console.log("No members found in conversation.");
     return;
  }

  const userId = members[0].user_id;
  const testMessage = "I need help with my password. How do I reset it?";
  
  console.log("\n==== Testing STANDARD AI response ====");
  console.log("Message:", testMessage);
  console.log("User ID:", userId);
  
  const response = await aiSupportService.processSupportMessage(conv.id, testMessage, userId);
  
  console.log("Result:");
  console.log(response);

  // 3. Test Escalation
  const escalateMessage = "My bank account is frozen and my payment failed immediately! This is an emergency.";
  console.log("\n==== Testing ESCALATION AI response ====");
  console.log("Message:", escalateMessage);
  const responseEscalate = await aiSupportService.processSupportMessage(conv.id, escalateMessage, userId);
  console.log("Result:");
  console.log(responseEscalate);
}

test().catch(console.error);
