-- Add soft deletion and forensic tracking fields to device_installations
ALTER TABLE public.device_installations
ADD COLUMN IF NOT EXISTS endpoint_status TEXT DEFAULT 'VALID' CHECK (endpoint_status IN ('VALID', 'INVALID')),
ADD COLUMN IF NOT EXISTS failure_reason TEXT,
ADD COLUMN IF NOT EXISTS failure_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_validation_reason TEXT DEFAULT 'NEW_REGISTRATION';
