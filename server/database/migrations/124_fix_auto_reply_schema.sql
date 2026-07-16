-- Fix Auto-Reply Settings Schema and Data
-- 1. Convert hour columns to TEXT to support "HH:mm" format from frontend
ALTER TABLE auto_reply_settings ALTER COLUMN start_hour TYPE TEXT USING start_hour::text;
ALTER TABLE auto_reply_settings ALTER COLUMN end_hour TYPE TEXT USING end_hour::text;

-- 2. Ensure canonical ID '00000000-0000-0000-0000-000000000000' exists
-- and it has valid string formatted hours
INSERT INTO auto_reply_settings (id, enabled, message, start_hour, end_hour, timezone)
VALUES (
    '00000000-0000-0000-0000-000000000000', 
    false, 
    'Our support team is currently offline. We will get back to you during business hours.', 
    '18:00', 
    '09:00', 
    'UTC'
)
ON CONFLICT (id) DO UPDATE SET
    start_hour = CASE WHEN auto_reply_settings.start_hour !~ '^\d{2}:\d{2}$' THEN '18:00' ELSE auto_reply_settings.start_hour END,
    end_hour = CASE WHEN auto_reply_settings.end_hour !~ '^\d{2}:\d{2}$' THEN '09:00' ELSE auto_reply_settings.end_hour END;

-- 3. Cleanup: Remove any duplicate rows with non-standard IDs
DELETE FROM auto_reply_settings WHERE id != '00000000-0000-0000-0000-000000000000';

-- 4. Re-verify RLS
ALTER TABLE auto_reply_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can manage auto-reply settings" ON auto_reply_settings;
CREATE POLICY "Admins can manage auto-reply settings" ON auto_reply_settings
FOR ALL USING (is_admin(auth.uid()));
