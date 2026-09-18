-- Migration 208: Fix Conversations and Wallets RLS Policies
-- Solves RLS violations for conversation creation and wallet initialization

DO $$
BEGIN
    -- 1. CONVERSATIONS RLS POLICIES
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversations') THEN
        ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "conversations_select_policy" ON public.conversations;
        DROP POLICY IF EXISTS "conversations_insert_policy" ON public.conversations;
        DROP POLICY IF EXISTS "conversations_update_policy" ON public.conversations;
        DROP POLICY IF EXISTS "conversations_insert" ON public.conversations;
        DROP POLICY IF EXISTS "conversations_select" ON public.conversations;

        CREATE POLICY "conversations_select_policy" ON public.conversations 
            FOR SELECT TO authenticated 
            USING (
                EXISTS (
                    SELECT 1 FROM public.conversation_members cm 
                    WHERE cm.conversation_id = conversations.id 
                    AND cm.user_id = auth.uid()
                ) 
                OR chat_type = 'support' 
                OR type = 'direct'
            );

        CREATE POLICY "conversations_insert_policy" ON public.conversations 
            FOR INSERT TO authenticated 
            WITH CHECK (true);

        CREATE POLICY "conversations_update_policy" ON public.conversations 
            FOR UPDATE TO authenticated 
            USING (
                EXISTS (
                    SELECT 1 FROM public.conversation_members cm 
                    WHERE cm.conversation_id = conversations.id 
                    AND cm.user_id = auth.uid()
                )
            );
    END IF;

    -- 2. CONVERSATION_MEMBERS RLS POLICIES
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'conversation_members') THEN
        ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "conversation_members_select_policy" ON public.conversation_members;
        DROP POLICY IF EXISTS "conversation_members_insert_policy" ON public.conversation_members;
        DROP POLICY IF EXISTS "conversation_members_update_policy" ON public.conversation_members;
        DROP POLICY IF EXISTS "conversation_members_insert" ON public.conversation_members;
        DROP POLICY IF EXISTS "conversation_members_select" ON public.conversation_members;

        CREATE POLICY "conversation_members_select_policy" ON public.conversation_members 
            FOR SELECT TO authenticated 
            USING (true);

        CREATE POLICY "conversation_members_insert_policy" ON public.conversation_members 
            FOR INSERT TO authenticated 
            WITH CHECK (
                user_id = auth.uid() 
                OR EXISTS (
                    SELECT 1 FROM public.conversation_members cm 
                    WHERE cm.conversation_id = conversation_members.conversation_id 
                    AND cm.user_id = auth.uid()
                )
                OR EXISTS (
                    SELECT 1 FROM public.conversations c 
                    WHERE c.id = conversation_members.conversation_id
                )
            );

        CREATE POLICY "conversation_members_update_policy" ON public.conversation_members 
            FOR UPDATE TO authenticated 
            USING (user_id = auth.uid());
    END IF;

    -- 3. WALLETS_STORE RLS POLICIES
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wallets_store') THEN
        ALTER TABLE public.wallets_store ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "wallets_store_select_policy" ON public.wallets_store;
        DROP POLICY IF EXISTS "wallets_store_insert_policy" ON public.wallets_store;
        DROP POLICY IF EXISTS "wallets_store_update_policy" ON public.wallets_store;
        DROP POLICY IF EXISTS "Users can view own wallets_store" ON public.wallets_store;

        CREATE POLICY "wallets_store_select_policy" ON public.wallets_store 
            FOR SELECT TO authenticated 
            USING (user_id = auth.uid());

        CREATE POLICY "wallets_store_insert_policy" ON public.wallets_store 
            FOR INSERT TO authenticated 
            WITH CHECK (user_id = auth.uid());

        CREATE POLICY "wallets_store_update_policy" ON public.wallets_store 
            FOR UPDATE TO authenticated 
            USING (user_id = auth.uid()) 
            WITH CHECK (user_id = auth.uid());
    END IF;

    -- 4. WALLETS (LEGACY / ALIAS TABLE) RLS POLICIES
    IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'wallets') THEN
        ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;

        DROP POLICY IF EXISTS "wallets_select_policy" ON public.wallets;
        DROP POLICY IF EXISTS "wallets_insert_policy" ON public.wallets;
        DROP POLICY IF EXISTS "wallets_update_policy" ON public.wallets;
        DROP POLICY IF EXISTS "wallet_select" ON public.wallets;

        CREATE POLICY "wallets_select_policy" ON public.wallets 
            FOR SELECT TO authenticated 
            USING (user_id = auth.uid());

        CREATE POLICY "wallets_insert_policy" ON public.wallets 
            FOR INSERT TO authenticated 
            WITH CHECK (user_id = auth.uid());

        CREATE POLICY "wallets_update_policy" ON public.wallets 
            FOR UPDATE TO authenticated 
            USING (user_id = auth.uid()) 
            WITH CHECK (user_id = auth.uid());
    END IF;
END $$;
