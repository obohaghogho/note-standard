-- Insert Support Bot Profile for AI Agent
-- This satisfies the messages.sender_id -> profiles.id foreign key constraint
INSERT INTO profiles (id, username, full_name, email, is_verified, plan_tier)
VALUES (
    '00000000-0000-0000-0000-000000000000',
    'support_bot',
    'Note Standard Support Team',
    'support@notestandard.com',
    true,
    'admin'
) ON CONFLICT (id) DO UPDATE SET
    username = EXCLUDED.username,
    full_name = EXCLUDED.full_name;
