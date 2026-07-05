-- Add fallback_used column to push_delivery_telemetry
ALTER TABLE push_delivery_telemetry
ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN DEFAULT false;
