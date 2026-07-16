require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase URL or Key');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});

const targetEmail = 'obohaghogho107@gmail.com';
const targetUsername = 'obohaghogho107'; 
const newPassword = 'Password123!';

async function cleanupAndRecreate() {
    let logs = [];
    const log = (msg) => {
        console.log(msg);
        logs.push(typeof msg === 'object' ? JSON.stringify(msg, null, 2) : msg);
    };

    log(`\n--- Deep Cleaning Account for ${targetEmail} (${targetUsername}) ---`);

    // 1. Check for zombie profile by username
    const { data: profiles, error: profileCheckError } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', targetUsername);

    if (profiles && profiles.length > 0) {
        log(`Found ${profiles.length} existing profile(s) with username '${targetUsername}'.`);
        
        for (const p of profiles) {
            log(`Processing orphan profile ID: ${p.id}...`);

            // Clean dependent tables manually (since cascade seems broken or missing)
            const tablesToClean = [
                { name: 'conversation_members', col: 'user_id' },
                { name: 'messages', col: 'sender_id' }, // careful if message is important, but for cleanup...
                { name: 'shared_notes', col: 'shared_with_user_id' },
                { name: 'subscriptions', col: 'user_id' },
                { name: 'notes', col: 'owner_id' } 
            ];

            for (const t of tablesToClean) {
                try {
                    const { error: cleanError } = await supabase
                        .from(t.name)
                        .delete()
                        .eq(t.col, p.id);
                    
                    if (cleanError) {
                        // Some tables might not exist or column mismatch? Ignore if 404-ish
                        log(`  - Warning cleaning ${t.name}: ${cleanError.message}`);
                    } else {
                        log(`  - Cleaned ${t.name}.`);
                    }
                } catch (err) {
                    log(`  - Exception cleaning ${t.name}: ${err.message}`);
                }
            }

            // Now try to delete profile again
            log(`  - Deleting profile ${p.id}...`);
            const { error: delError } = await supabase
                .from('profiles')
                .delete()
                .eq('id', p.id);
            
            if (delError) log(`Failed to delete profile ${p.id}: ${delError.message}`);
            else log(`✅ Deleted profile ${p.id}.`);
        }
    } else {
        log('No conflicting profiles found for username.');
    }

    // 2. Check for auth user by email (again, just to be sure)
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    const existingUser = users?.find(u => u.email === targetEmail);

    if (existingUser) {
        log(`Found existing auth user (ID: ${existingUser.id}). Deleting...`);
        const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id);
        if (deleteError) log(`Error deleting auth user: ${deleteError.message}`);
        else log('Auth user deleted.');
    }

    // 3. Create fresh user
    log('\n--- Creating fresh user ---');
    const { data, error: createError } = await supabase.auth.admin.createUser({
        email: targetEmail,
        password: newPassword,
        email_confirm: true,
        user_metadata: { full_name: 'Test User' }
    });

    if (createError) {
        log(`❌ Error creating user: ${createError.message}`);
        log(createError);
    } else {
        log('✅ User created successfully!');
        log(`Email: ${targetEmail}`);
        log(`Password: ${newPassword}`);
    }

    fs.writeFileSync('login_debug_v2.log', logs.join('\n'));
}

cleanupAndRecreate();
