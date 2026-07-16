/**
 * One-time script to create storage RLS policies for the 'chat-media' bucket.
 * Run: node server/scripts/create-storage-policies.js
 */
const path = require("path");

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: path.join(__dirname, "..", ".env.development"),
  });
}
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const supabase = require(path.join(__dirname, "..", "config", "supabase"));

async function createPolicies() {
  console.log("Creating storage policies for chat-media bucket...\n");

  const sql = `
        -- Drop existing policies first to avoid conflicts
        DROP POLICY IF EXISTS "Authenticated users can upload chat media" ON storage.objects;
        DROP POLICY IF EXISTS "Authenticated users can read chat media" ON storage.objects;
        DROP POLICY IF EXISTS "Authenticated users can update chat media" ON storage.objects;
        DROP POLICY IF EXISTS "Authenticated users can delete chat media" ON storage.objects;

        -- INSERT policy
        CREATE POLICY "Authenticated users can upload chat media"
        ON storage.objects
        FOR INSERT
        TO authenticated
        WITH CHECK (bucket_id = 'chat-media');

        -- SELECT policy
        CREATE POLICY "Authenticated users can read chat media"
        ON storage.objects
        FOR SELECT
        TO authenticated
        USING (bucket_id = 'chat-media');

        -- UPDATE policy  
        CREATE POLICY "Authenticated users can update chat media"
        ON storage.objects
        FOR UPDATE
        TO authenticated
        USING (bucket_id = 'chat-media');

        -- DELETE policy
        CREATE POLICY "Authenticated users can delete chat media"
        ON storage.objects
        FOR DELETE
        TO authenticated
        USING (bucket_id = 'chat-media');
    `;

  const { error } = await supabase.rpc("exec_sql", { query: sql });

  if (error) {
    console.log("RPC exec_sql not available, this is expected.");
    console.log("Please run the following SQL in your Supabase SQL Editor:\n");
    console.log(sql);
    console.log("\n--- OR ---\n");
    console.log("Go to: Supabase Dashboard > Storage > Policies");
    console.log('And add these policies for the "chat-media" bucket:');
    console.log(
      "  1. INSERT for authenticated users (WITH CHECK: bucket_id = 'chat-media')",
    );
    console.log(
      "  2. SELECT for authenticated users (USING: bucket_id = 'chat-media')",
    );
    console.log(
      "  3. UPDATE for authenticated users (USING: bucket_id = 'chat-media')",
    );
    console.log(
      "  4. DELETE for authenticated users (USING: bucket_id = 'chat-media')",
    );
  } else {
    console.log("✅ All storage policies created successfully!");
  }
}

createPolicies();
