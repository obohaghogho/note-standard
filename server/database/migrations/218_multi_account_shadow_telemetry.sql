-- Expand push_delivery_telemetry for Phase 1.5 Shadow Mode
ALTER TABLE public.push_delivery_telemetry
ADD COLUMN IF NOT EXISTS routing_engine_version TEXT,
ADD COLUMN IF NOT EXISTS routing_decision TEXT,
ADD COLUMN IF NOT EXISTS suppression_reason TEXT,
ADD COLUMN IF NOT EXISTS installation_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS active_socket_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS endpoint_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS shadow_matches_legacy BOOLEAN;
