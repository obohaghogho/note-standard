const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.development') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupTestUser() {
    const email = 'chat_test_v1@example.com';
    const password = 'Password123!';
    const username = 'chat_tester_v1';
    const fullName = 'Chat Tester V1';

    console.log('--- Setting up Chat Test User ---');

    // 1. Check if user exists
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) {
        console.error('Error listing users:', JSON.stringify(userError, null, 2));
        return;
    }

    const existingUser = userData.users.find(u => u.email === email);
    let targetUserId;

    if (existingUser) {
        console.log('User already exists:', existingUser.id);
        targetUserId = existingUser.id;
    } else {
        console.log('Creating user...');
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email: email,
            password: password,
            email_confirm: true
        });

        if (authError) {
            console.error('Error creating auth user:', JSON.stringify(authError, null, 2));
            return;
        }
        console.log('User created:', authData.user.id);
        targetUserId = authData.user.id;
    }

    // 2. Ensure Profile exists
    await ensureProfile(targetUserId, username, fullName);

    // Removed authData reference

    // 2. Ensure Profile exists
    await ensureProfile(authData.user.id, username, fullName);
}

async function ensureProfile(userId, username, fullName) {
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', userId)
        .maybeSingle();

    if (profileError) {
        console.error('Error checking profile:', profileError.message);
        return;
    }

    if (!profile) {
        console.log('Creating profile...');
        const { error: insertError } = await supabase
            .from('profiles')
            .upsert({
                id: userId,
                username: username,
                full_name: fullName,
                updated_at: new Date()
            }, { onConflict: 'id' });

        if (insertError) {
            console.error('Error creating profile:', insertError.message);
        } else {
            console.log('Profile created successfully');
        }
    } else {
        console.log('Profile already exists');
    }
}

setupTestUser().catch(console.error);
