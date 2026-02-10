-- Create table for tracking translation errors/reports
CREATE TABLE IF NOT EXISTS translation_reports (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
    original_text TEXT,
    translated_text TEXT,
    target_language TEXT,
    reported_at TIMESTAMPTZ DEFAULT NOW(),
    comment TEXT
);

-- RLS Policies
ALTER TABLE translation_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create reports" ON translation_reports
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view reports" ON translation_reports
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.id = auth.uid()
            AND profiles.role IN ('admin', 'support')
        )
    );
