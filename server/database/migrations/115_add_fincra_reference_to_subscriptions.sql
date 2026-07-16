-- Add fincra_reference to subscriptions table
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS fincra_reference TEXT;
