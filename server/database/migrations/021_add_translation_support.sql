-- Add language columns to support translation features

-- Add preferred_language to profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS preferred_language TEXT DEFAULT 'en';

-- Add language and translation_metadata to messages
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS original_language TEXT DEFAULT 'en',
ADD COLUMN IF NOT EXISTS translation_metadata JSONB DEFAULT '{}'::jsonb;
