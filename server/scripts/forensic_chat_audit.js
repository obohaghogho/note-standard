const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function forensicAudit() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();
    console.log('=== FORENSIC CHAT AUDIT ===\n');

    // 1. Find user William in profiles
    const williamRes = await client.query(`
      SELECT id, username, email, full_name, avatar_url, created_at, kyc_level, is_verified
      FROM profiles
      WHERE username ILIKE '%william%' OR email ILIKE '%william%' OR full_name ILIKE '%william%';
    `);
    console.log(`[1] USER(S) MATCHING 'william' (${williamRes.rows.length}):`);
    williamRes.rows.forEach(w => console.log(JSON.stringify(w, null, 2)));

    // 2. Search for recent messages or messages containing "happy new month" or "month"
    const msgRes = await client.query(`
      SELECT m.id, m.conversation_id, m.sender_id, m.content, m.created_at, m.is_deleted,
             p.username AS sender_username
      FROM messages m
      LEFT JOIN profiles p ON p.id = m.sender_id
      WHERE m.content ILIKE '%happy new month%' 
         OR m.content ILIKE '%happy%'
         OR m.created_at > NOW() - INTERVAL '3 days'
      ORDER BY m.created_at DESC
      LIMIT 20;
    `);
    console.log(`\n[2] RECENT MESSAGES / "HAPPY NEW MONTH" (${msgRes.rows.length}):`);
    msgRes.rows.forEach(m => console.log(` - ID: ${m.id} | Conv: ${m.conversation_id} | Sender: ${m.sender_username} (${m.sender_id}) | Content: "${m.content}" | Date: ${m.created_at} | Deleted: ${m.is_deleted}`));

    // 3. Find conversations involving William or the target message
    const targetConvId = 'bfed3623-37ea-45ff-8af7-17695aeb4d0f';
    const convRes = await client.query(`
      SELECT cm.conversation_id, cm.user_id, cm.role, cm.is_deleted,
             c.type, c.created_at AS conv_created_at, c.last_message_at,
             p.username, p.email, p.full_name
      FROM conversation_members cm
      JOIN conversations c ON c.id = cm.conversation_id
      JOIN profiles p ON p.id = cm.user_id
      WHERE cm.conversation_id = $1;
    `, [targetConvId]);

    console.log(`\n[3] MEMBERS OF CONVERSATION ${targetConvId} (${convRes.rows.length}):`);
    convRes.rows.forEach(c => {
      console.log(` - User: ${c.full_name} (@${c.username}, ${c.email}, ${c.user_id}) | MemberDeleted: ${c.is_deleted} | Role: ${c.role}`);
    });

    // 3b. Check William's conversation members
    if (williamRes.rows.length > 0) {
      const williamId = williamRes.rows[0].id;
      const wConvs = await client.query(`
        SELECT cm.conversation_id, cm.is_deleted, c.type, c.created_at, c.last_message_at
        FROM conversation_members cm
        JOIN conversations c ON c.id = cm.conversation_id
        WHERE cm.user_id = $1;
      `, [williamId]);
      console.log(`\n[3b] ALL CONVERSATION MEMBERSHIPS FOR WILLIAM (${wConvs.rows.length}):`);
      wConvs.rows.forEach(wc => console.log(JSON.stringify(wc)));
    }

    // 4. Check all recent conversations in database
    const allConvsRes = await client.query(`
      SELECT c.id, c.type, c.created_at, c.last_message_at, c.updated_at,
             count(cm.id) AS member_count,
             array_agg(p.username) AS member_usernames
      FROM conversations c
      LEFT JOIN conversation_members cm ON cm.conversation_id = c.id
      LEFT JOIN profiles p ON p.id = cm.user_id
      WHERE c.created_at > NOW() - INTERVAL '3 days' OR c.updated_at > NOW() - INTERVAL '3 days'
      GROUP BY c.id
      ORDER BY c.created_at DESC
      LIMIT 15;
    `);

    console.log(`\n[4] ALL RECENT CONVERSATIONS (LAST 3 DAYS) (${allConvsRes.rows.length}):`);
    allConvsRes.rows.forEach(c => {
      console.log(` - ConvID: ${c.id} | Type: ${c.type} | Members (${c.member_count}): [${(c.member_usernames || []).join(', ')}] | Created: ${c.created_at}`);
    });

  } catch (err) {
    console.error('Forensic audit failed:', err);
  } finally {
    await client.end();
  }
}

forensicAudit();
