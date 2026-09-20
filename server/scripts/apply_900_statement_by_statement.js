const { Client } = require('pg');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const STATEMENTS = [
  // SECTION 1: CRITICAL INDEXES
  `CREATE INDEX IF NOT EXISTS idx_messages_conv_created_active ON public.messages(conversation_id, created_at DESC) WHERE is_deleted = false;`,
  `CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);`,
  `CREATE INDEX IF NOT EXISTS idx_messages_read_null ON public.messages(conversation_id, sender_id) WHERE read_at IS NULL;`,
  `CREATE INDEX IF NOT EXISTS idx_messages_delivered_null ON public.messages(conversation_id) WHERE delivered_at IS NULL;`,
  `CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON public.messages(reply_to_id) WHERE reply_to_id IS NOT NULL;`,
  `CREATE INDEX IF NOT EXISTS idx_messages_event_id ON public.messages(event_id) WHERE event_id IS NOT NULL;`,
  `CREATE INDEX IF NOT EXISTS idx_conv_members_conv_user ON public.conversation_members(conversation_id, user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_conv_members_user_conv ON public.conversation_members(user_id, conversation_id);`,
  `CREATE INDEX IF NOT EXISTS idx_conv_members_watermark ON public.conversation_members(conversation_id, user_id, cleared_at);`,
  `CREATE INDEX IF NOT EXISTS idx_notes_owner_created ON public.notes(owner_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON public.notes(updated_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_shared_notes_note_user ON public.shared_notes(note_id, shared_with_user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_shared_notes_user_note ON public.shared_notes(shared_with_user_id, note_id);`,
  `CREATE INDEX IF NOT EXISTS idx_tx_user_created ON public.transactions(user_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_tx_pending_status ON public.transactions(provider, status, created_at) WHERE status = 'PENDING';`,
  `CREATE INDEX IF NOT EXISTS idx_tx_uncredited ON public.transactions(type, wallet_credit_status, created_at) WHERE wallet_credit_status != 'WALLET_CREDITED';`,
  `CREATE INDEX IF NOT EXISTS idx_wr_user_status ON public.withdrawal_requests(user_id, status);`,
  `CREATE INDEX IF NOT EXISTS idx_wr_pending ON public.withdrawal_requests(status, created_at) WHERE status = 'pending';`,
  `CREATE INDEX IF NOT EXISTS idx_wallets_user_currency ON public.wallets(user_id, currency);`,
  `CREATE INDEX IF NOT EXISTS idx_ledger_wallet_created ON public.ledger_entries(wallet_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_ledger_ref ON public.ledger_entries(reference);`,
  `CREATE INDEX IF NOT EXISTS idx_comm_posts_space_created ON public.community_posts(space_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_comm_posts_author ON public.community_posts(author_id);`,
  `CREATE INDEX IF NOT EXISTS idx_comm_comments_post ON public.community_comments(post_id, created_at ASC);`,
  `CREATE INDEX IF NOT EXISTS idx_comm_likes_post_user ON public.community_likes(post_id, user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_comm_bookmarks_post_user ON public.community_bookmarks(post_id, user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_team_members_team_user ON public.team_members(team_id, user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_team_members_user_team ON public.team_members(user_id, team_id);`,
  `CREATE INDEX IF NOT EXISTS idx_team_notes_team_created ON public.team_notes(team_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON public.support_tickets(assigned_to, status);`,
  `CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON public.support_messages(ticket_id, created_at ASC);`,
  `CREATE INDEX IF NOT EXISTS idx_fb_reports_user ON public.feedback_reports(user_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_fb_comments_report ON public.feedback_comments(report_id, created_at ASC);`,
  `CREATE INDEX IF NOT EXISTS idx_fb_votes_report_user ON public.feedback_votes(report_id, user_id);`,
  `CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);`,

  // SECTION 2: RLS OPTIMIZATION WITH SUBQUERY CACHING
  `DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;`,
  `CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (id = (SELECT auth.uid()));`,
  `DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;`,
  `CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (id = (SELECT auth.uid()));`,
  `DROP POLICY IF EXISTS "Users can view own notes" ON public.notes;`,
  `CREATE POLICY "Users can view own notes" ON public.notes FOR SELECT USING (owner_id = (SELECT auth.uid()));`,
  `DROP POLICY IF EXISTS "Users can insert own notes" ON public.notes;`,
  `CREATE POLICY "Users can insert own notes" ON public.notes FOR INSERT WITH CHECK (owner_id = (SELECT auth.uid()));`,
  `DROP POLICY IF EXISTS "Users can update own notes" ON public.notes;`,
  `CREATE POLICY "Users can update own notes" ON public.notes FOR UPDATE USING (owner_id = (SELECT auth.uid()));`,
  `DROP POLICY IF EXISTS "Users can delete own notes" ON public.notes;`,
  `CREATE POLICY "Users can delete own notes" ON public.notes FOR DELETE USING (owner_id = (SELECT auth.uid()));`,

  // SECTION 3: AUTO-PRUNING RPC
  `CREATE OR REPLACE FUNCTION public.rpc_prune_telemetry_and_logs()
   RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER AS $$
   DECLARE
       v_telemetry INTEGER := 0;
       v_scheduler INTEGER := 0;
       v_audit     INTEGER := 0;
   BEGIN
       IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'push_delivery_telemetry') THEN
           DELETE FROM public.push_delivery_telemetry WHERE created_at < NOW() - INTERVAL '7 days';
           GET DIAGNOSTICS v_telemetry = ROW_COUNT;
       END IF;

       IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'scheduler_job_runs') THEN
           DELETE FROM public.scheduler_job_runs WHERE completed_at < NOW() - INTERVAL '14 days';
           GET DIAGNOSTICS v_scheduler = ROW_COUNT;
       END IF;

       IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'message_audit_logs') THEN
           DELETE FROM public.message_audit_logs WHERE server_timestamp < NOW() - INTERVAL '30 days';
           GET DIAGNOSTICS v_audit = ROW_COUNT;
       END IF;

       RETURN jsonb_build_object(
           'success', true,
           'pruned_telemetry', v_telemetry,
           'pruned_scheduler_runs', v_scheduler,
           'pruned_message_audits', v_audit
       );
   END;
   $$;`,
  `GRANT EXECUTE ON FUNCTION public.rpc_prune_telemetry_and_logs() TO service_role;`,
  `GRANT EXECUTE ON FUNCTION public.rpc_prune_telemetry_and_logs() TO authenticated;`
];

async function run() {
  let dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!dbUrl) {
    console.error("❌ No DATABASE_URL found");
    process.exit(1);
  }

  // Switch pooler port 6543 to direct db connection port 5432 if needed
  dbUrl = dbUrl.replace(':6543', ':5432');

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    console.log("Connected to Supabase PostgreSQL database directly!");

    let count = 0;
    for (const stmt of STATEMENTS) {
      try {
        await client.query(stmt);
        count++;
        console.log(`[${count}/${STATEMENTS.length}] Applied statement successfully.`);
      } catch (err) {
        console.warn(`[Skip statement] ${err.message}`);
      }
    }

    console.log(`\n🎉 Applied ${count} database optimization statements successfully!`);

    // Run ANALYZE to update PostgreSQL query planner statistics immediately
    console.log("Running ANALYZE to update query planner stats...");
    await client.query("ANALYZE;");
    console.log("✅ ANALYZE completed! Query planner is now using all new indexes.");

  } catch (err) {
    console.error("❌ Execution error:", err.message);
  } finally {
    await client.end();
  }
}

run().then(() => process.exit(0)).catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
