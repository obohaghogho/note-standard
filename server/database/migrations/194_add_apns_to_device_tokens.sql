-- Migration 194: Add 'apns' to native_device_tokens type constraint
ALTER TABLE public.native_device_tokens DROP CONSTRAINT IF EXISTS native_device_tokens_type_check;
ALTER TABLE public.native_device_tokens ADD CONSTRAINT native_device_tokens_type_check CHECK (type IN ('fcm', 'voip', 'apns'));
