const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  console.log('=== 1. SEARCHING FOR WILLIAM & ADMIN PROFILES ===');
  const usersRes = await client.query(
    `SELECT id, email, username, full_name, role FROM profiles WHERE username ILIKE '%william%' OR email ILIKE '%william%' OR role = 'admin'`
  );
  console.log(usersRes.rows);

  const william = usersRes.rows.find(u => u.username?.toLowerCase().includes('william') || u.email?.toLowerCase().includes('william'));

  console.log('\n=== 2. CONVERSATIONS BETWEEN ADMIN(S) AND WILLIAM ===');
  if (william) {
    const convsRes = await client.query(
      `SELECT cm.conversation_id, cm.user_id, cm.status, cm.is_deleted, cm.cleared_at, c.type, c.created_at
       FROM conversation_members cm
       JOIN conversations c ON c.id = cm.conversation_id
       WHERE cm.conversation_id IN (
         SELECT conversation_id FROM conversation_members WHERE user_id = $1
       )
       ORDER BY cm.conversation_id, cm.user_id`,
      [william.id]
    );
    console.log(convsRes.rows);

    console.log('\n=== 3. MESSAGES IN THESE CONVERSATIONS ===');
    const msgRes = await client.query(
      `SELECT id, conversation_id, sender_id, content, created_at, is_deleted 
       FROM messages 
       WHERE conversation_id IN (
         SELECT conversation_id FROM conversation_members WHERE user_id = $1
       )
       ORDER BY created_at DESC LIMIT 20`,
      [william.id]
    );
    console.log(msgRes.rows);
  }

  console.log('\n=== 4. SPECIFIC USER PROFILES ===');
  const profilesRes = await client.query(
    `SELECT id, email, username, full_name, role FROM profiles WHERE id IN ('587b4497-1ab9-4293-b986-d60e0d1422d9', '5089c266-1ad6-4a83-b23f-064d65995345', '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd')`
  );
  console.log(profilesRes.rows);

  console.log('\n=== 5. CONVERSATION MEMBERS WITH PROFILES ===');
  const cmProfilesRes = await client.query(
    `SELECT cm.conversation_id, cm.user_id, p.username, p.email, p.role, cm.status, cm.is_deleted, cm.cleared_at
     FROM conversation_members cm
     JOIN profiles p ON p.id = cm.user_id
     WHERE cm.conversation_id IN ('c53fd624-0d9b-4479-a7f5-b064fef186a4', '467666eb-e846-4364-94e7-f771e6382276')`
  );
  console.log(cmProfilesRes.rows);

  await client.end();
}

main().catch(console.error);
