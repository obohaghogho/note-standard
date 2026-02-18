-- ====================================
-- TEAM IMAGE SUPPORT
-- Updates message types and sets up storage
-- ====================================

-- 1. Update message type check to include 'image'
ALTER TABLE team_messages DROP CONSTRAINT IF EXISTS team_messages_type_check;
ALTER TABLE team_messages ADD CONSTRAINT team_messages_type_check 
  CHECK (message_type IN ('text', 'note_share', 'system', 'image'));

-- 2. Setup Storage for Team Assets
-- We use a DO block to safely handle bucket creation if the storage schema exists
DO $$
BEGIN
    -- Check if storage schema exists before trying to access storage.buckets
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
        INSERT INTO storage.buckets (id, name, public) 
        VALUES ('team-assets', 'team-assets', true)
        ON CONFLICT (id) DO NOTHING;
    ELSE
        RAISE NOTICE 'Storage schema not found. Skipping bucket creation.';
    END IF;
END $$;

-- 3. Storage Policies for team-assets
-- Wrap everything in existence checks to avoid errors if storage schema is missing
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
        -- Allow public read access to images
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Access'
        ) THEN
            CREATE POLICY "Public Access" ON storage.objects 
                FOR SELECT USING (bucket_id = 'team-assets');
        END IF;

        -- Allow authenticated users to upload images
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated Upload'
        ) THEN
            CREATE POLICY "Authenticated Upload" ON storage.objects 
                FOR INSERT TO authenticated 
                WITH CHECK (bucket_id = 'team-assets');
        END IF;

        -- Allow users to delete their own uploads
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Users can delete own team assets'
        ) THEN
            CREATE POLICY "Users can delete own team assets" ON storage.objects 
                FOR DELETE TO authenticated 
                USING (bucket_id = 'team-assets' AND (auth.uid() = owner));
        END IF;
    END IF;
END $$;
