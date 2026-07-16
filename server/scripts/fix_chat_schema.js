/**
 * Fix Chat Schema - Migration Runner
 *
 * This script applies the missing columns and tables to the live Supabase DB
 * to resolve the 500 errors in the chat.
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY,
);

async function applyMigrations() {
  console.log("\n==========================================");
  console.log("📦 Chat Schema Fix Migration");
  console.log("==========================================\n");

  const queries = [
    // 1. Create media_attachments table
    `CREATE TABLE IF NOT EXISTS public.media_attachments (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            uploader_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
            conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
            file_name TEXT NOT NULL,
            file_type TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            storage_path TEXT NOT NULL,
            metadata JSONB DEFAULT '{}',
            created_at TIMESTAMPTZ DEFAULT NOW()
        );`,

    // 2. Add columns to messages
    `ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;`,
    `ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sentiment JSONB;`,
    `ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS attachment_id UUID REFERENCES public.media_attachments(id) ON DELETE SET NULL;`,

    // 3. Ensure indexes
    `CREATE INDEX IF NOT EXISTS messages_created_at_idx ON public.messages(created_at DESC);`,
    `CREATE INDEX IF NOT EXISTS messages_conversation_id_idx ON public.messages(conversation_id);`,

    // 4. RLS for media_attachments
    `ALTER TABLE public.media_attachments ENABLE ROW LEVEL SECURITY;`,

    `DO $$ 
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Participants can view media in their conversations') THEN
                CREATE POLICY "Participants can view media in their conversations" ON public.media_attachments
                FOR SELECT USING (
                    EXISTS (
                        SELECT 1 FROM conversation_members cm 
                        WHERE cm.conversation_id = media_attachments.conversation_id 
                        AND cm.user_id = auth.uid()
                    )
                );
            END IF;
        END $$;`,

    `DO $$ 
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Participants can upload media to their conversations') THEN
                CREATE POLICY "Participants can upload media to their conversations" ON public.media_attachments
                FOR INSERT WITH CHECK (
                    auth.uid() = uploader_id AND
                    EXISTS (
                        SELECT 1 FROM conversation_members cm 
                        WHERE cm.conversation_id = conversation_id 
                        AND cm.user_id = auth.uid()
                    )
                );
            END IF;
        END $$;`,

    // 5. Reload Schema Cache for PostgREST
    "NOTIFY pgrst, 'reload schema';",
  ];

  console.log("🚀 Applying SQL commands via Supabase RPC...");

  // Note: We can only run raw SQL via RPC if the user has a 'exec_sql' function.
  // Otherwise, we'll suggest the user to run it in the Dashboard.

  console.log("\n⚠️  RAW SQL EXECUTION NOTICE:");
  console.log(
    "If you have access to the Supabase SQL Editor, run this script there:",
  );
  console.log("-------------------------------------------------------");
  console.log(queries.join("\n"));
  console.log("-------------------------------------------------------");

  // Attempting to run via RPC (some projects have this helper)
  const { error } = await supabase.rpc("exec_sql", {
    sql_query: queries.join("\n"),
  });

  if (error) {
    if (error.message.includes('function "exec_sql" does not exist')) {
      console.log(
        '\n❌ Automatic migration failed: "exec_sql" function not found in DB.',
      );
      console.log(
        "👉 ACTION REQUIRED: Please copy the SQL above and paste it into the Supabase SQL Editor.",
      );
    } else {
      console.error("\n❌ SQL Error:", error.message);
    }
  } else {
    console.log("\n✅ Migration applied successfully!");
  }

  console.log("\n==========================================");
}

applyMigrations().catch(console.error);
