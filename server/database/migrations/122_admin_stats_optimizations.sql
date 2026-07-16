-- Function to get top creators by note count
CREATE OR REPLACE FUNCTION get_top_creators(limit_count INTEGER DEFAULT 3)
RETURNS TABLE (
    id UUID,
    name TEXT,
    avatar TEXT,
    count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.username as name,
        p.avatar_url as avatar,
        COUNT(n.id) as count
    FROM profiles p
    JOIN notes n ON p.id = n.owner_id
    GROUP BY p.id
    ORDER BY count DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get usage trends for the last X days
CREATE OR REPLACE FUNCTION get_usage_trends(days_limit INTEGER DEFAULT 7)
RETURNS TABLE (
    day TEXT,
    notes BIGINT,
    users BIGINT
) AS $$
BEGIN
    RETURN QUERY
    WITH date_series AS (
        SELECT generate_series(
            CURRENT_DATE - (days_limit - 1) * INTERVAL '1 day',
            CURRENT_DATE,
            '1 day'::interval
        )::date AS d
    ),
    note_counts AS (
        SELECT date_trunc('day', created_at)::date as d, COUNT(*) as count
        FROM notes
        WHERE created_at >= CURRENT_DATE - (days_limit - 1) * INTERVAL '1 day'
        GROUP BY d
    ),
    user_counts AS (
        SELECT date_trunc('day', created_at)::date as d, COUNT(*) as count
        FROM profiles
        WHERE created_at >= CURRENT_DATE - (days_limit - 1) * INTERVAL '1 day'
        GROUP BY d
    )
    SELECT 
        to_char(ds.d, 'Dy') as day,
        COALESCE(nc.count, 0) as notes,
        COALESCE(uc.count, 0) as users
    FROM date_series ds
    LEFT JOIN note_counts nc ON ds.d = nc.d
    LEFT JOIN user_counts uc ON ds.d = uc.d
    ORDER BY ds.d ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
