const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'server/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CARLY_ID = '4005e54f-5f05-47f5-97f8-8d0391fff9a4';
const JENNIFER_ID = 'a1134fbf-3054-4005-aaa3-b86382207106';

async function main() {
  console.log('--- Inspecting messages table sample row ---');
  const { data: sample } = await supabase.from('messages').select('*').limit(2);
  console.log('Sample row from `messages`:', sample);

  // Check conversations / chat_messages / direct_messages / messages tables
  const tables = ['messages', 'chat_messages', 'conversations', 'direct_messages', 'notifications', 'push_subscriptions'];
  for (const t of tables) {
    try {
      const { data, error } = await supabase.from(t).select('*').limit(1);
      if (!error) console.log(`Table '${t}' exists. Keys:`, data[0] ? Object.keys(data[0]) : 'empty');
    } catch (e) {
      // ignore
    }
  }

  // Find all messages in `messages` where user_id or recipient_id or sender_id matches Carly or Jennifer G
  const { data: m1 } = await supabase.from('messages').select('*').limit(50);
  console.log(`\nTotal rows in messages table sample: ${m1 ? m1.length : 0}`);
  if (m1 && m1.length > 0) {
    const relevant = m1.filter(m => 
      m.user_id === CARLY_ID || m.user_id === JENNIFER_ID ||
      m.sender_id === CARLY_ID || m.sender_id === JENNIFER_ID ||
      m.recipient_id === CARLY_ID || m.recipient_id === JENNIFER_ID ||
      JSON.stringify(m).includes(CARLY_ID) || JSON.stringify(m).includes(JENNIFER_ID)
    );
    console.log(`Relevant rows in messages sample: ${relevant.length}`);
    console.log(JSON.stringify(relevant, null, 2));
  }
}

main().catch(console.error);
