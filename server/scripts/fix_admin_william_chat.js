const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function fixAdminWilliamChat() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  try {
    await client.connect();

    const convId = 'bfed3623-37ea-45ff-8af7-17695aeb4d0f';
    const adminId = '5089c266-1ad6-4a83-b23f-064d65995345';

    console.log(`Fixing conversation ${convId} for admin user ${adminId}...`);

    const res = await client.query(`
      UPDATE conversation_members
      SET cleared_at = NULL, is_deleted = false, deleted_at = NULL
      WHERE conversation_id = $1 AND user_id = $2
      RETURNING *;
    `, [convId, adminId]);

    console.log('Updated conversation_members:', res.rows);

    const resInternal = await client.query(`
      UPDATE conversation_members_internal
      SET cleared_at = NULL
      WHERE conversation_id = $1 AND user_id = $2
      RETURNING *;
    `, [convId, adminId]);

    console.log('Updated conversation_members_internal:', resInternal.rows);

  } catch (err) {
    console.error(err);
  } finally {
    await client.end();
  }
}

fixAdminWilliamChat();
