-- =====================================================
-- PRODUCTION CHAT UPGRADE MIGRATION
-- =====================================================

-- 1. Media Attachments Table
CREATE TABLE IF NOT EXISTS media_attachments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    uploader_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT NOT NULL, -- 'image/png', 'video/mp4', etc.
    file_size INTEGER NOT NULL,
    storage_path TEXT NOT NULL, -- Path in Supabase Storage
    metadata JSONB DEFAULT '{}', -- Duration, dimensions, etc.
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Call Sessions Table
CREATE TABLE IF NOT EXISTS call_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    initiator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    type TEXT CHECK (type IN ('voice', 'video')) NOT NULL,
    status TEXT CHECK (status IN ('active', 'ended', 'missed', 'rejected')) DEFAULT 'active',
    started_at TIMESTAMPTZ DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Update Messages Table
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_id UUID REFERENCES media_attachments(id) ON DELETE SET NULL;
-- Support for pagination (id is already UUIDv4, but created_at is good for sorting)
CREATE INDEX IF NOT EXISTS messages_created_at_idx ON messages(created_at DESC);

-- 4. RLS Policies for Media Attachments
ALTER TABLE media_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view media in their conversations" ON media_attachments
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM conversation_members cm 
        WHERE cm.conversation_id = media_attachments.conversation_id 
        AND cm.user_id = auth.uid()
    )
);

CREATE POLICY "Participants can upload media to their conversations" ON media_attachments
FOR INSERT WITH CHECK (
    auth.uid() = uploader_id AND
    EXISTS (
        SELECT 1 FROM conversation_members cm 
        WHERE cm.conversation_id = conversation_id 
        AND cm.user_id = auth.uid()
    )
);

-- 5. RLS Policies for Call Sessions
ALTER TABLE call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Participants can view calls in their conversations" ON call_sessions
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM conversation_members cm 
        WHERE cm.conversation_id = call_sessions.conversation_id 
        AND cm.user_id = auth.uid()
    )
);

CREATE POLICY "Participants can manage calls in their conversations" ON call_sessions
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM conversation_members cm 
        WHERE cm.conversation_id = conversation_id 
        AND cm.user_id = auth.uid()
    )
);

-- 6. Storage Bucket Setup (Handled via API/Console usually, but documenting here)
-- Bucket: 'chat-media'
-- Policy: Only authenticated users can access, path-based restrictions.
