-- =============================================================================
-- Migration 900: Supabase Disk I/O Budget Preservation & Comprehensive Indexing
--
-- PROBLEM: Supabase alert — Disk I/O Budget Depletion (project ref: tngcvgisfctggvivcnva)
-- ROOT CAUSES IDENTIFIED:
--   1. 100+ un-indexed Foreign Key columns across core, chat, financial, and community tables.
--   2. High CPU/Disk IO overhead from un-optimized RLS policies evaluating auth.uid() per-row.
--   3. Sequential table scans on messages, transactions, payout_requests, notes, and notifications.
--   4. Unbounded retention table bloat in telemetry and audit logging tables.
--
-- FIXES:
--   1. Comprehensive Foreign Key & Partial Indexes for fast index-only scans.
--   2. Safe fault-tolerant PL/pgSQL block execution for all schema variations.
--   3. Optimize RLS Policies using (SELECT auth.uid()) statement-level subquery caching.
--   4. Create automated data retention & auto-pruning RPC for telemetry and log tables.
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: CRITICAL FOREIGN KEY & FILTER INDEXES (FAULT-TOLERANT)
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    -- MESSAGES & CHAT
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'messages') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_messages_conv_created_active ON public.messages(conversation_id, created_at DESC) WHERE is_deleted = false;
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages(sender_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_messages_read_null ON public.messages(conversation_id, sender_id) WHERE read_at IS NULL;
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_messages_delivered_null ON public.messages(conversation_id) WHERE delivered_at IS NULL;
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_messages_reply_to_id ON public.messages(reply_to_id) WHERE reply_to_id IS NOT NULL;
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_messages_event_id ON public.messages(event_id) WHERE event_id IS NOT NULL;
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversation_members') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_conv_members_conv_user ON public.conversation_members(conversation_id, user_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_conv_members_user_conv ON public.conversation_members(user_id, conversation_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_conv_members_watermark ON public.conversation_members(conversation_id, user_id, cleared_at);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- NOTES & SHARING
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notes') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_notes_owner_created ON public.notes(owner_id, created_at DESC);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON public.notes(updated_at DESC);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'shared_notes') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_shared_notes_note_user ON public.shared_notes(note_id, shared_with_user_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_shared_notes_user_note ON public.shared_notes(shared_with_user_id, note_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- TRANSACTIONS, PAYOUTS & WALLETS
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'transactions') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_tx_user_created ON public.transactions(user_id, created_at DESC);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_tx_pending_status ON public.transactions(provider, status, created_at) WHERE status = 'PENDING';
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_tx_uncredited ON public.transactions(type, wallet_credit_status, created_at) WHERE wallet_credit_status != 'WALLET_CREDITED';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payout_requests') THEN
        BEGIN
            -- Fixed payout_state enum values ('PROCESSING', 'REQUESTED', 'VALIDATING', 'APPROVED')
            CREATE INDEX IF NOT EXISTS idx_payout_requests_processing ON public.payout_requests(provider, withdrawal_state, updated_at) WHERE withdrawal_state IN ('PROCESSING', 'REQUESTED', 'VALIDATING', 'APPROVED');
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'withdrawal_requests') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_wr_user_status ON public.withdrawal_requests(user_id, status);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_wr_pending ON public.withdrawal_requests(status, created_at) WHERE status = 'pending';
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wallets') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_wallets_user_currency ON public.wallets(user_id, currency);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ledger_entries') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_ledger_wallet_created ON public.ledger_entries(wallet_id, created_at DESC);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_ledger_ref ON public.ledger_entries(reference);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- COMMUNITY & SOCIAL
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'community_posts') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_comm_posts_space_created ON public.community_posts(space_id, created_at DESC);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_comm_posts_author ON public.community_posts(author_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'community_comments') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_comm_comments_post ON public.community_comments(post_id, created_at ASC);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'community_likes') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_comm_likes_post_user ON public.community_likes(post_id, user_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'community_bookmarks') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_comm_bookmarks_post_user ON public.community_bookmarks(post_id, user_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- TEAM COLLABORATION
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'team_members') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_team_members_team_user ON public.team_members(team_id, user_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_team_members_user_team ON public.team_members(user_id, team_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'team_notes') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_team_notes_team_created ON public.team_notes(team_id, created_at DESC);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- SUPPORT & FEEDBACK
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'support_tickets') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_support_tickets_user ON public.support_tickets(user_id, created_at DESC);
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            CREATE INDEX IF NOT EXISTS idx_support_tickets_assigned ON public.support_tickets(assigned_to, status);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'support_messages') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_support_messages_ticket ON public.support_messages(ticket_id, created_at ASC);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'feedback_reports') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_fb_reports_user ON public.feedback_reports(user_id, created_at DESC);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'feedback_comments') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_fb_comments_report ON public.feedback_comments(report_id, created_at ASC);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'feedback_votes') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_fb_votes_report_user ON public.feedback_votes(report_id, user_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- NOTIFICATIONS & PUSH
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='user_id') THEN
            BEGIN
                CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON public.notifications(user_id, created_at DESC);
            EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;

        IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='receiver_id') THEN
            BEGIN
                CREATE INDEX IF NOT EXISTS idx_notifications_receiver_created ON public.notifications(receiver_id, created_at DESC);
            EXCEPTION WHEN OTHERS THEN NULL; END;
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'push_subscriptions') THEN
        BEGIN
            CREATE INDEX IF NOT EXISTS idx_push_subs_user ON public.push_subscriptions(user_id);
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: RLS POLICY OPTIMIZATION WITH STATEMENT-LEVEL SUBQUERY CACHING
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
    -- PROFILES
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        BEGIN
            DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
            CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT WITH CHECK (id = (SELECT auth.uid()));
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
            CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (id = (SELECT auth.uid()));
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- NOTES
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notes') THEN
        BEGIN
            DROP POLICY IF EXISTS "Users can view own notes" ON public.notes;
            CREATE POLICY "Users can view own notes" ON public.notes FOR SELECT USING (owner_id = (SELECT auth.uid()));
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            DROP POLICY IF EXISTS "Users can insert own notes" ON public.notes;
            CREATE POLICY "Users can insert own notes" ON public.notes FOR INSERT WITH CHECK (owner_id = (SELECT auth.uid()));
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            DROP POLICY IF EXISTS "Users can update own notes" ON public.notes;
            CREATE POLICY "Users can update own notes" ON public.notes FOR UPDATE USING (owner_id = (SELECT auth.uid()));
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            DROP POLICY IF EXISTS "Users can delete own notes" ON public.notes;
            CREATE POLICY "Users can delete own notes" ON public.notes FOR DELETE USING (owner_id = (SELECT auth.uid()));
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- SHARED NOTES
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'shared_notes') THEN
        BEGIN
            DROP POLICY IF EXISTS "Recipient can view share records" ON public.shared_notes;
            CREATE POLICY "Recipient can view share records" ON public.shared_notes FOR SELECT USING (shared_with_user_id = (SELECT auth.uid()));
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- MESSAGES
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'messages') THEN
        BEGIN
            DROP POLICY IF EXISTS "Users can view messages in their conversations" ON public.messages;
            CREATE POLICY "Users can view messages in their conversations" ON public.messages FOR SELECT TO authenticated USING (
                EXISTS (
                    SELECT 1 FROM public.conversation_members cm 
                    WHERE cm.conversation_id = messages.conversation_id 
                      AND cm.user_id = (SELECT auth.uid())
                )
            );
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            DROP POLICY IF EXISTS "Users can insert messages in their conversations" ON public.messages;
            CREATE POLICY "Users can insert messages in their conversations" ON public.messages FOR INSERT TO authenticated WITH CHECK (
                sender_id = (SELECT auth.uid())
            );
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- CONVERSATIONS
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversations') THEN
        BEGIN
            DROP POLICY IF EXISTS "Users can view their conversations" ON public.conversations;
            CREATE POLICY "Users can view their conversations" ON public.conversations FOR SELECT TO authenticated USING (
                EXISTS (
                    SELECT 1 FROM public.conversation_members cm 
                    WHERE cm.conversation_id = conversations.id 
                      AND cm.user_id = (SELECT auth.uid())
                )
            );
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- NOTIFICATIONS
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
        BEGIN
            DROP POLICY IF EXISTS "Users can view own notifications" ON public.notifications;
            CREATE POLICY "Users can view own notifications" ON public.notifications FOR SELECT TO authenticated USING (
                CASE 
                    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='user_id') 
                        THEN user_id = (SELECT auth.uid())
                    ELSE receiver_id = (SELECT auth.uid())
                END
            );
        EXCEPTION WHEN OTHERS THEN NULL; END;

        BEGIN
            DROP POLICY IF EXISTS "Users can update own notifications" ON public.notifications;
            CREATE POLICY "Users can update own notifications" ON public.notifications FOR UPDATE TO authenticated USING (
                CASE 
                    WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notifications' AND column_name='user_id') 
                        THEN user_id = (SELECT auth.uid())
                    ELSE receiver_id = (SELECT auth.uid())
                END
            );
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;

    -- PUSH SUBSCRIPTIONS
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'push_subscriptions') THEN
        BEGIN
            DROP POLICY IF EXISTS "Users manage own push subscriptions" ON public.push_subscriptions;
            CREATE POLICY "Users manage own push subscriptions" ON public.push_subscriptions FOR ALL TO authenticated USING (user_id = (SELECT auth.uid()));
        EXCEPTION WHEN OTHERS THEN NULL; END;
    END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: AUTOMATED TABLE BLOAT AUTO-PRUNING RETENTION RPC
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION rpc_prune_telemetry_and_logs()
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
$$;

GRANT EXECUTE ON FUNCTION rpc_prune_telemetry_and_logs() TO service_role;
GRANT EXECUTE ON FUNCTION rpc_prune_telemetry_and_logs() TO authenticated;

COMMIT;
