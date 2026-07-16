-- Migration: 101_manual_deposits_system
-- Purpose: Support manual user deposits with Grey bank transfer and proof submission

BEGIN;

CREATE TABLE IF NOT EXISTS manual_deposits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    amount NUMERIC(20, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL, -- USD, GBP, EUR
    reference TEXT NOT NULL UNIQUE, -- NS-USERID-TIMESTAMP
    proof_url TEXT, -- Cloudinary URL for proof
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for user lookups
CREATE INDEX IF NOT EXISTS idx_manual_deposits_user_id ON manual_deposits(user_id);
CREATE INDEX IF NOT EXISTS idx_manual_deposits_status ON manual_deposits(status);
CREATE INDEX IF NOT EXISTS idx_manual_deposits_reference ON manual_deposits(reference);

-- Enable RLS
ALTER TABLE manual_deposits ENABLE ROW LEVEL SECURITY;

-- 1. Users can view their own deposits
CREATE POLICY "Users can view own deposits" ON manual_deposits
    FOR SELECT USING (auth.uid() = user_id);

-- 2. Users can create their own deposits
CREATE POLICY "Users can create own deposits" ON manual_deposits
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 3. Admin view (Admin middleware handles this usually, but good to have)
CREATE POLICY "Admins can manage all manual deposits" ON manual_deposits
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.role IN ('admin', 'support')
        )
    );

-- Trigger for update_updated_at_column
DROP TRIGGER IF EXISTS update_manual_deposits_updated_at ON manual_deposits;
CREATE TRIGGER update_manual_deposits_updated_at
    BEFORE UPDATE ON manual_deposits
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMIT;
