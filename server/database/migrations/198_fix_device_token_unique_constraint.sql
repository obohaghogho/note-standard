-- Migration 198: Fix native_device_tokens unique constraint
-- We need to enforce a 1:1 mapping between device_id and token
-- A device can only belong to one user at a time to prevent misrouted pushes

-- Drop the old constraint
ALTER TABLE public.native_device_tokens DROP CONSTRAINT IF EXISTS native_device_tokens_user_id_token_key;
ALTER TABLE public.native_device_tokens DROP CONSTRAINT IF EXISTS native_device_tokens_device_id_key;
ALTER TABLE public.native_device_tokens DROP CONSTRAINT IF EXISTS native_device_tokens_token_key;

-- Ensure device_id is not null before making it unique
-- If there are null device_ids, generate a temporary one
UPDATE public.native_device_tokens SET device_id = uuid_generate_v4()::text WHERE device_id IS NULL;
ALTER TABLE public.native_device_tokens ALTER COLUMN device_id SET NOT NULL;

-- Remove duplicates if any exist before adding unique constraint
DELETE FROM public.native_device_tokens a USING (
  SELECT MIN(ctid) as ctid, device_id
  FROM public.native_device_tokens
  GROUP BY device_id HAVING COUNT(*) > 1
) b
WHERE a.device_id = b.device_id AND a.ctid <> b.ctid;

-- Add new constraints
ALTER TABLE public.native_device_tokens ADD CONSTRAINT native_device_tokens_device_id_key UNIQUE (device_id);

-- Also add a unique constraint on token to prevent multiple devices sharing same token
ALTER TABLE public.native_device_tokens ADD CONSTRAINT native_device_tokens_token_key UNIQUE (token);
