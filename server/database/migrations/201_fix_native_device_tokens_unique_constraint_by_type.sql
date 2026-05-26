-- Migration 201: Fix native_device_tokens unique constraint by type
-- Enforces uniqueness per (device_id, type) instead of device_id alone
-- This allows a single device to register separate tokens for standard APNs and VoIP.

BEGIN;

-- Drop the old constraint if it exists
ALTER TABLE public.native_device_tokens DROP CONSTRAINT IF EXISTS native_device_tokens_device_id_key;

-- Remove duplicates if any exist on (device_id, type) before adding unique constraint
DELETE FROM public.native_device_tokens a USING (
  SELECT MIN(ctid) as ctid, device_id, type
  FROM public.native_device_tokens
  GROUP BY device_id, type HAVING COUNT(*) > 1
) b
WHERE a.device_id = b.device_id AND a.type = b.type AND a.ctid <> b.ctid;

-- Add new composite unique constraint
ALTER TABLE public.native_device_tokens DROP CONSTRAINT IF EXISTS native_device_tokens_device_id_type_key;
ALTER TABLE public.native_device_tokens ADD CONSTRAINT native_device_tokens_device_id_type_key UNIQUE (device_id, type);

COMMIT;
