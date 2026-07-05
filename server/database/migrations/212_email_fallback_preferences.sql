-- Migration 212: Add email fallback preferences and tracking
-- Tracks whether an unread/undelivered message has triggered an email to prevent spam.

-- 1. Add email preference to user profiles (default to 'immediate' which means 15m delay)
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS email_notifications VARCHAR(50) DEFAULT 'immediate';

-- 2. Add email_sent tracking to messages
ALTER TABLE public.messages
ADD COLUMN IF NOT EXISTS email_sent BOOLEAN DEFAULT FALSE;

-- 3. Create index to speed up the cron job query (delivered_at IS NULL AND email_sent = FALSE)
CREATE INDEX IF NOT EXISTS idx_messages_undelivered_email 
ON public.messages (delivered_at, email_sent, created_at)
WHERE delivered_at IS NULL AND email_sent = FALSE;
