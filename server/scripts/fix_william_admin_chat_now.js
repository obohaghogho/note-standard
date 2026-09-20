const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('=== FIXING WILLIAM AND ADMIN CONVERSATION MEMBERSHIPS ===');

  const updateRes = await client.query(`
    UPDATE conversation_members
    SET cleared_at = NULL, is_deleted = false, deleted_at = NULL
    WHERE conversation_id IN (
      SELECT conversation_id 
      FROM conversation_members 
      WHERE user_id = '587b4497-1ab9-4293-b986-d60e0d1422d9'
    )
    RETURNING conversation_id, user_id, status, is_deleted, cleared_at;
  `);

  console.log('Updated conversation_members rows:', updateRes.rows);

  const updateInternalRes = await client.query(`
    UPDATE conversation_members_internal
    SET cleared_at = NULL
    WHERE conversation_id IN (
      SELECT conversation_id 
      FROM conversation_members 
      WHERE user_id = '587b4497-1ab9-4293-b986-d60e0d1422d9'
    )
    RETURNING conversation_id, user_id, cleared_at;
  `).catch(err => console.warn('conversation_members_internal update note:', err.message));

  if (updateInternalRes?.rows) {
    console.log('Updated conversation_members_internal rows:', updateInternalRes.rows);
  }

  await client.end();
}

main().catch(console.error);
