-- 214_push_health_status_view.sql
-- Create a view for operational monitoring of push notification telemetry

CREATE OR REPLACE VIEW public.push_health_status AS
SELECT
    error_code,
    count(*) AS occurrences,
    max(created_at) AS last_seen
FROM public.push_metrics
WHERE created_at > now() - interval '1 hour'
GROUP BY error_code;
