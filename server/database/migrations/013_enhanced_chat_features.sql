-- =====================================================
-- ENHANCED CHAT FEATURES MIGRATION
-- =====================================================

-- 1. Audit Logs Table
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES profiles(id),
    action TEXT NOT NULL, -- 'suspend_user', 'broadcast', 'resolve_chat', etc.
    target_type TEXT, -- 'user', 'conversation', 'broadcast'
    target_id UUID,
    details JSONB,
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Broadcasts Table
CREATE TABLE IF NOT EXISTS broadcasts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    admin_id UUID REFERENCES profiles(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    target_audience TEXT DEFAULT 'all', -- 'all', 'active', 'pro'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ
);

-- 3. Broadcast Reads Table (for notification tracking)
CREATE TABLE IF NOT EXISTS broadcast_reads (
    user_id UUID REFERENCES profiles(id),
    broadcast_id UUID REFERENCES broadcasts(id),
    read_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, broadcast_id)
);

-- 4. Auto-Reply Settings Table
CREATE TABLE IF NOT EXISTS auto_reply_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    enabled BOOLEAN DEFAULT false,
    message TEXT,
    start_hour INTEGER, -- 0-23
    end_hour INTEGER,   -- 0-23
    timezone TEXT DEFAULT 'UTC',
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS admin_audit_logs_admin_id_idx ON admin_audit_logs(admin_id);
CREATE INDEX IF NOT EXISTS admin_audit_logs_action_idx ON admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS broadcasts_admin_id_idx ON broadcasts(admin_id);

-- RLS Policies for Audit Logs (Admin only)
ALTER TABLE admin_audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view all audit logs" ON admin_audit_logs
FOR SELECT USING (is_admin(auth.uid()));

-- RLS Policies for Broadcasts
ALTER TABLE broadcasts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view active broadcasts" ON broadcasts
FOR SELECT USING (expires_at IS NULL OR expires_at > NOW());

CREATE POLICY "Admins can manage broadcasts" ON broadcasts
FOR ALL USING (is_admin(auth.uid()));

-- RLS Policies for Broadcast Reads
ALTER TABLE broadcast_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own read status" ON broadcast_reads
FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for Auto-Reply Settings
ALTER TABLE auto_reply_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage auto-reply settings" ON auto_reply_settings
FOR ALL USING (is_admin(auth.uid()));

-- Insert default auto-reply settings if not exists
INSERT INTO auto_reply_settings (enabled, message, start_hour, end_hour)
SELECT false, 'Our support team is currently offline. We will get back to you during business hours.', 18, 9
WHERE NOT EXISTS (SELECT 1 FROM auto_reply_settings);
-- Sentiment Analysis
ALTER TABLE messages ADD COLUMN IF NOT EXISTS sentiment JSONB; -- { score: number, comparative: number, label: string }
