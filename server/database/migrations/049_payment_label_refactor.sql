-- Migration: Payment Label Refactor
-- Date: 2026-02-13

ALTER TABLE transactions 
ADD COLUMN IF NOT EXISTS display_label TEXT DEFAULT 'Digital Assets Purchase',
ADD COLUMN IF NOT EXISTS internal_coin TEXT,
ADD COLUMN IF NOT EXISTS internal_amount NUMERIC(30, 18),
ADD COLUMN IF NOT EXISTS product_type TEXT DEFAULT 'digital_asset';

-- Update existing transactions to have the default label
UPDATE transactions SET display_label = 'Digital Assets Purchase' WHERE display_label IS NULL;
