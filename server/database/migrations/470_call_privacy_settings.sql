-- Migration 470: Call Privacy Settings
-- Adds independent voice and video call privacy controls to user profiles

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'voice_call_privacy'
    ) THEN
        ALTER TABLE public.profiles 
        ADD COLUMN voice_call_privacy TEXT DEFAULT 'everyone' CHECK (voice_call_privacy IN ('everyone', 'connections', 'nobody'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'video_call_privacy'
    ) THEN
        ALTER TABLE public.profiles 
        ADD COLUMN video_call_privacy TEXT DEFAULT 'everyone' CHECK (video_call_privacy IN ('everyone', 'connections', 'nobody'));
    END IF;
END $$;

-- Create index for quick lookup during call initiation permission checks
CREATE INDEX IF NOT EXISTS idx_profiles_call_privacy ON public.profiles(id, voice_call_privacy, video_call_privacy);
