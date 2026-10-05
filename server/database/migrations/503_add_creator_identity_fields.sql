-- Migration 503: Phase 1 — Creator Identity & Creator Mode Schema Additions
-- Additive, safe, default-compatible column additions to profiles table.

ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS is_creator BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS creator_mode_enabled BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS creator_category TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS creator_onboarded_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb;

-- Indexing for discovery and query performance
CREATE INDEX IF NOT EXISTS idx_profiles_is_creator 
  ON profiles(is_creator) 
  WHERE is_creator = true;

CREATE INDEX IF NOT EXISTS idx_profiles_creator_category 
  ON profiles(creator_category) 
  WHERE is_creator = true;
