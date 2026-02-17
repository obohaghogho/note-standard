-- Migration: Revenue Trends and Analytics
-- Provides helper functions for the admin dashboard monetization stats

CREATE OR REPLACE FUNCTION get_revenue_trend()
RETURNS TABLE (
    day DATE,
    total_revenue NUMERIC,
    revenue_type TEXT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        created_at::DATE as day,
        SUM(amount) as total_revenue,
        revenue_logs.revenue_type
    FROM revenue_logs
    WHERE created_at > NOW() - INTERVAL '30 days'
    GROUP BY day, revenue_logs.revenue_type
    ORDER BY day DESC;
END;
$$;

-- Function to handle subscription renewals/status
CREATE OR REPLACE FUNCTION check_subscription_status()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Downgrade expired subscriptions to FREE
    UPDATE subscriptions
    SET 
        plan_type = 'FREE',
        plan_tier = 'FREE',
        end_date = NULL,
        updated_at = NOW()
    WHERE end_date < NOW() AND plan_type != 'FREE';
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_revenue_trend TO service_role;
GRANT EXECUTE ON FUNCTION check_subscription_status TO service_role;
