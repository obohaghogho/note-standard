-- ==============================================================================
-- MIGRATION 460: SUPABASE SECURITY HARDENING & FULL RLS REMEDIATION
-- Resolves Supabase Alerts: rls_disabled_in_public & sensitive_columns_exposed
-- ==============================================================================

-- STEP 1: ENABLE ROW-LEVEL SECURITY ON ALL TABLES IN PUBLIC SCHEMA
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN 
        SELECT relname 
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' 
          AND c.relkind = 'r'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.relname);
    END LOOP;
END $$;


-- STEP 2: REVOKE ALL PUBLIC & ANON PRIVILEGES ON EXISTING OBJECTS
-- Lock down all tables, sequences, and functions from unauthenticated 'anon' and 'public' roles.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, public;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, public;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM anon, public;


-- STEP 3: RESET DEFAULT PRIVILEGES FOR FUTURE CREATED TABLES
-- Ensure any future table created automatically revokes anon access and empowers service_role.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, public;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, public;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, public;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO authenticated;


-- STEP 4: GRANT NECESSARY SCHEMA ACCESS TO AUTHENTICATED AND SERVICE ROLE
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT ALL ON SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;


-- STEP 5: ENSURE USER-FACING TABLES HAVE SUITABLE RLS POLICIES
-- Add helper function / policies for standard client-accessible tables if missing.

DO $$
BEGIN
    -- PROFILES POLICY
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles') THEN
        BEGIN
            CREATE POLICY "Profiles are viewable by authenticated users" 
            ON public.profiles FOR SELECT TO authenticated USING (true);
        EXCEPTION WHEN duplicate_object THEN NULL; END;
        
        BEGIN
            CREATE POLICY "Users can update own profile" 
            ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
        EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    -- MESSAGES POLICY
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'messages') THEN
        BEGIN
            CREATE POLICY "Users can view messages in their conversations" 
            ON public.messages FOR SELECT TO authenticated USING (
                EXISTS (
                    SELECT 1 FROM public.conversation_members cm 
                    WHERE cm.conversation_id = messages.conversation_id 
                      AND cm.user_id = auth.uid()
                )
            );
        EXCEPTION WHEN duplicate_object THEN NULL; END;

        BEGIN
            CREATE POLICY "Users can insert messages in their conversations" 
            ON public.messages FOR INSERT TO authenticated WITH CHECK (
                sender_id = auth.uid()
            );
        EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    -- CONVERSATIONS POLICY
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversations') THEN
        BEGIN
            CREATE POLICY "Users can view their conversations" 
            ON public.conversations FOR SELECT TO authenticated USING (
                EXISTS (
                    SELECT 1 FROM public.conversation_members cm 
                    WHERE cm.conversation_id = conversations.id 
                      AND cm.user_id = auth.uid()
                )
            );
        EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    -- NOTIFICATIONS POLICY
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notifications') THEN
        BEGIN
            CREATE POLICY "Users can view own notifications" 
            ON public.notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
        EXCEPTION WHEN duplicate_object THEN NULL; END;

        BEGIN
            CREATE POLICY "Users can update own notifications" 
            ON public.notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
        EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    -- PUSH SUBSCRIPTIONS POLICY
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'push_subscriptions') THEN
        BEGIN
            CREATE POLICY "Users manage own push subscriptions" 
            ON public.push_subscriptions FOR ALL TO authenticated USING (user_id = auth.uid());
        EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

    -- ADS POLICY (Public read for active ads)
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ads') THEN
        BEGIN
            CREATE POLICY "Anyone authenticated can view active ads" 
            ON public.ads FOR SELECT TO authenticated USING (status = 'active');
        EXCEPTION WHEN duplicate_object THEN NULL; END;
    END IF;

END $$;

-- STEP 6: VERIFICATION RECORD IN MIGRATIONS TABLE
INSERT INTO _migrations (filename) 
VALUES ('460_fix_supabase_rls_and_security_hardening.sql')
ON CONFLICT (filename) DO UPDATE SET applied_at = NOW();
