const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'server/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const CARLY_ID = '4005e54f-5f05-47f5-97f8-8d0391fff9a4';
const JENNIFER_ID = 'a1134fbf-3054-4005-aaa3-b86382207106';

async function main() {
  // Direct messages between Carly & Jennifer G
  const { data: directMsgs } = await supabase
    .from('messages')
    .select('*')
    .or(`and(sender_id.eq.${CARLY_ID},recipient_id.eq.${JENNIFER_ID}),and(sender_id.eq.${JENNIFER_ID},recipient_id.eq.${CARLY_ID})`)
    .order('created_at', { ascending: true });

  console.log(`\n====================================================`);
  console.log(`CHRONOLOGICAL DIRECT MESSAGES (${directMsgs ? directMsgs.length : 0} Total)`);
  console.log(`====================================================\n`);

  if (directMsgs && directMsgs.length > 0) {
    directMsgs.forEach((m, idx) => {
      const sender = m.sender_id === CARLY_ID ? 'Carly (CM1)' : 'Jennifer G (jcwkgrenn54)';
      const receiver = m.recipient_id === CARLY_ID ? 'Carly (CM1)' : 'Jennifer G (jcwkgrenn54)';
      const readState = (m.is_read || m.read) ? 'READ ✓✓' : 'UNREAD ⏳';
      console.log(`[#${idx+1}] Sent: ${m.created_at} | From: ${sender} -> To: ${receiver}`);
      console.log(`     Status: [${m.status || 'sent'}] | Read: [${readState}] | DeliveredAt: ${m.delivered_at || 'NULL'}`);
      console.log(`     Content: "${m.content}"`);
      console.log('--------------------------------------------------------------------------------');
    });
  }
}

main().catch(console.error);
