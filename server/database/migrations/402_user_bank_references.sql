-- Migration: 402_user_bank_references.sql
-- Persistent, unique bank deposit references per user & provider for NoteStandard Treasury.

CREATE TABLE IF NOT EXISTS user_bank_references (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL DEFAULT 'grey',
    reference VARCHAR(50) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_user_bank_references_user_provider ON user_bank_references(user_id, provider, is_active);
CREATE INDEX IF NOT EXISTS idx_user_bank_references_ref ON user_bank_references(reference);
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_user_provider ON user_bank_references(user_id, provider) WHERE is_active = true;

COMMENT ON TABLE user_bank_references IS 'Persistent, user-tied deposit references for Lead Bank / Grey ACH & Wire transfers.';
