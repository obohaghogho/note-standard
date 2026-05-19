require('dotenv').config();
const { Client } = require('pg');

async function fixForeignKeys() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL
  });

  try {
    await client.connect();
    console.log("Connected to PostgreSQL successfully!");

    // 1. Inspect existing foreign keys
    const inspectRes = await client.query(`
      SELECT
          tc.constraint_name,
          kcu.column_name, 
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name 
      FROM 
          information_schema.table_constraints AS tc 
          JOIN information_schema.key_column_usage AS kcu
            ON tc.constraint_name = kcu.constraint_name
            AND tc.table_schema = kcu.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name
            AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'messages';
    `);

    console.log("CURRENT FOREIGN KEYS:");
    console.log(inspectRes.rows);

    const fks = inspectRes.rows.map(r => r.column_name);

    // 2. Add sender_id foreign key if missing
    if (!fks.includes('sender_id')) {
      console.log("Adding foreign key constraint for sender_id pointing to profiles(id)...");
      await client.query(`
        ALTER TABLE messages
        ADD CONSTRAINT fk_messages_sender
        FOREIGN KEY (sender_id) REFERENCES profiles(id)
        ON DELETE SET NULL;
      `);
      console.log("fk_messages_sender added successfully!");
    } else {
      console.log("sender_id foreign key already exists.");
    }

    // 3. Add conversation_id foreign key if missing
    if (!fks.includes('conversation_id')) {
      console.log("Adding foreign key constraint for conversation_id pointing to conversations(id)...");
      await client.query(`
        ALTER TABLE messages
        ADD CONSTRAINT fk_messages_conversation
        FOREIGN KEY (conversation_id) REFERENCES conversations(id)
        ON DELETE CASCADE;
      `);
      console.log("fk_messages_conversation added successfully!");
    } else {
      console.log("conversation_id foreign key already exists.");
    }

    // 4. Add attachment_id foreign key if missing
    if (!fks.includes('attachment_id')) {
      console.log("Adding foreign key constraint for attachment_id pointing to media_attachments(id)...");
      // Check if attachment_id column contains invalid or orphaned values before adding FK
      await client.query(`
        ALTER TABLE messages
        ADD CONSTRAINT fk_messages_attachment
        FOREIGN KEY (attachment_id) REFERENCES media_attachments(id)
        ON DELETE SET NULL;
      `);
      console.log("fk_messages_attachment added successfully!");
    } else {
      console.log("attachment_id foreign key already exists.");
    }

    // 5. Reload PostgREST schema cache
    console.log("Reloading PostgREST schema cache...");
    await client.query("NOTIFY pgrst, 'reload schema';");
    console.log("PostgREST schema cache reloaded successfully!");

  } catch (err) {
    console.error("Error fixing foreign keys:", err);
  } finally {
    await client.end();
  }
}

fixForeignKeys();
