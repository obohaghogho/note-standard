/* eslint-disable */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function auditAghoghoSupport() {
  console.log('=== STEP 1: Finding profiles for Aghogho ===');
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, username, full_name, email, role, created_at');

  if (pErr) {
    console.error('Error fetching profiles:', pErr);
    return;
  }

  const aghoghoProfiles = profiles.filter(p =>
    (p.username && p.username.toLowerCase().includes('aghogho')) ||
    (p.full_name && p.full_name.toLowerCase().includes('aghogho')) ||
    (p.email && p.email.toLowerCase().includes('aghogho'))
  );

  console.log('Aghogho Profiles found:', aghoghoProfiles);

  if (!aghoghoProfiles.length) {
    console.log('No profiles matching "aghogho" found directly in profiles array. Searching database with ilike...');
    const { data: searchProfiles } = await supabase
      .from('profiles')
      .select('id, username, full_name, email, role, created_at')
      .or('username.ilike.%aghogho%,full_name.ilike.%aghogho%,email.ilike.%aghogho%');
    console.log('ILike Search Results:', searchProfiles);
    if (searchProfiles && searchProfiles.length) {
      aghoghoProfiles.push(...searchProfiles);
    }
  }

  const aghoghoIds = aghoghoProfiles.map(p => p.id);

  if (!aghoghoIds.length) {
    console.log('No user profile found for Aghogho.');
    return;
  }

  console.log('\n=== STEP 2: Conversations involving Aghogho ===');
  const { data: members, error: mErr } = await supabase
    .from('conversation_members')
    .select('conversation_id, user_id, role, status')
    .in('user_id', aghoghoIds);

  if (mErr) console.error('Members Error:', mErr);
  console.log('Aghogho Membership:', members);

  const convIds = (members || []).map(m => m.conversation_id);

  const { data: conversations, error: cErr } = await supabase
    .from('conversations')
    .select('*')
    .in('id', convIds);

  if (cErr) console.error('Conversations Error:', cErr);
  console.log('Aghogho Conversations:', conversations);

  console.log('\n=== STEP 3: Detailed Messages in Support Conversations ===');
  for (const conv of (conversations || [])) {
    console.log(`\n--- Conversation ID: ${conv.id} | Name: ${conv.name} | Type: ${conv.type} | ChatType: ${conv.chat_type} | SupportStatus: ${conv.support_status} ---`);
    
    const { data: msgs, error: msgErr } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true });

    if (msgErr) console.error('Error fetching messages:', msgErr);
    
    console.log(`Total messages in conversation: ${msgs?.length || 0}`);
    
    const formattedMsgs = (msgs || []).map(m => ({
      id: m.id.slice(0, 8),
      created_at: m.created_at,
      sender_id: m.sender_id === aghoghoIds[0] ? 'AGHOGHO' : m.sender_id?.slice(0, 8),
      sender_type: m.sender_type || 'N/A',
      content: m.content.length > 50 ? m.content.slice(0, 47) + '...' : m.content,
      read_at: m.read_at ? m.read_at.slice(11, 19) : 'unread',
      delivered_at: m.delivered_at ? m.delivered_at.slice(11, 19) : 'none'
    }));

    console.table(formattedMsgs);
  }
}

auditAghoghoSupport().catch(console.error);
