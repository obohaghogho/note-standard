-- ==========================================
-- 042_SEED_LIVE_ADS.SQL
-- ==========================================

DO $$
DECLARE
    v_user_id UUID;
BEGIN
    -- 1. Get a valid user ID (the first one found)
    SELECT id INTO v_user_id FROM profiles LIMIT 1;
    
    IF v_user_id IS NULL THEN
        RAISE NOTICE 'No users found in profiles table. Cannot seed ads.';
        RETURN;
    END IF;

    -- 2. Clear existing test ads if any (optional, keeping it for a clean state)
    -- DELETE FROM ads WHERE status = 'approved' AND user_id = v_user_id;

    -- 3. Insert Diverse Live Ads
    INSERT INTO ads (user_id, title, content, media_url, destination_url, status, start_date, tags)
    VALUES 
    (
        v_user_id, 
        '🚀 Note Standard Pro', 
        'Unlock unlimited notes, real-time collaboration, and AI-powered insights. Upgrade today!', 
        'https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&q=80&w=800', 
        '/dashboard/billing', 
        'approved', 
        now(), 
        ARRAY['productivity', 'announcement']
    ),
    (
        v_user_id, 
        'Minimalist Workspace Setup', 
        'Discover the best peripherals and furniture for your home office. Hand-picked for developers.', 
        'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&q=80&w=800', 
        'https://example.com/workspace', 
        'approved', 
        now(), 
        ARRAY['lifestyle', 'workspace']
    ),
    (
        v_user_id, 
        'Cloud Scale API Services', 
        'High-performance GraphQL APIs for your modern web applications. Global edge deployment.', 
        'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=800', 
        'https://example.com/api', 
        'approved', 
        now(), 
        ARRAY['developer', 'cloud']
    ),
    (
        v_user_id, 
        'Ultimate CSS Mastery', 
        'Learn advanced CSS grid, flexbox, and animations. The only course you will ever need.', 
        'https://images.unsplash.com/photo-1542831371-29b0f74f9713?auto=format&fit=crop&q=80&w=800', 
        'https://example.com/css-course', 
        'approved', 
        now(), 
        ARRAY['education', 'design']
    ),
    (
        v_user_id, 
        'Coffee for Night Owls', 
        'Premium dark roast selection for late-night coding sessions. Stay focused, stay awake.', 
        'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&q=80&w=800', 
        'https://example.com/coffee', 
        'approved', 
        now(), 
        ARRAY['dev', 'lifestyle']
    );

    RAISE NOTICE 'Seed successful: 5 live ads added for user %', v_user_id;

END $$;
