require('dotenv').config({ path: '../.env' });
const supabase = require('../config/database');

async function testInsert() {
  const conversationId = 'c641e438-b5fe-43a6-974f-2b8d7154c210';
  const aiResponse = { text: "Hello this is a TEST AI response to confirm DB insertion" };
  
  let botSenderId;
  const { data: adminUser } = await supabase.from('profiles').select('id').eq('plan_tier', 'admin').limit(1).single();
  botSenderId = adminUser.id;

  const { data: autoMsg, error: autoErr } = await supabase
    .from("messages")
    .insert([{
      conversation_id: conversationId,
      sender_id: botSenderId,
      content: aiResponse.text,
      type: "text",
    }])
    .select();

  console.log("Error:", autoErr);
  console.log("Data inserted successfully:", !!autoMsg);
}

testInsert().catch(console.error);
