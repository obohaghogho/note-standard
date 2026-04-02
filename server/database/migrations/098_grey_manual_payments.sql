-- Migration for Grey Manual Payments
-- Purpose: Store bank transfer instructions for user-facing manual payments.

BEGIN;

CREATE TABLE IF NOT EXISTS grey_instructions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    currency TEXT NOT NULL UNIQUE,
    bank_name TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_number TEXT NOT NULL,
    swift_code TEXT,
    iban TEXT,
    instructions TEXT, -- Extra details (e.g. For USD use XXX)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Initial Grey Accounts (Placeholder details, should be updated by Admin)
INSERT INTO grey_instructions (currency, bank_name, account_name, account_number, swift_code, instructions)
VALUES 
('USD', 'Silvergate Bank', 'Aghogho Plyboard Enterprise', '1234567890', 'SILVUS33', 'Only for international wire transfers. Ensure reference is in narration.')
ON CONFLICT (currency) DO NOTHING;

INSERT INTO grey_instructions (currency, bank_name, account_name, account_number, iban, instructions)
VALUES 
('EUR', 'Clear Junction', 'Aghogho Plyboard Enterprise', '9988776655', 'IE12CJBB300000', 'SEPA transfers only. Reference is mandatory.')
ON CONFLICT (currency) DO NOTHING;

INSERT INTO grey_instructions (currency, bank_name, account_name, account_number, swift_code, instructions)
VALUES 
('GBP', 'Modulr FS Ltd', 'Aghogho Plyboard Enterprise', '11223344', 'MODLGB22', 'UK Faster Payments supported.')
ON CONFLICT (currency) DO NOTHING;

-- Trigger for update_updated_at_column should already exist from base schema
DROP TRIGGER IF EXISTS update_grey_instructions_updated_at ON grey_instructions;
CREATE TRIGGER update_grey_instructions_updated_at
    BEFORE UPDATE ON grey_instructions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS: Open for read by authenticated users (to see instructions), restricted for admins to write.
ALTER TABLE grey_instructions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view grey instructions" ON grey_instructions;
CREATE POLICY "Anyone can view grey instructions" ON grey_instructions
    FOR SELECT USING (true);

COMMIT;
