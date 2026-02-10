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
const logFile = 'login_debug_v3.log';

// Clear log file
fs.writeFileSync(logFile, '');

const log = (msg) => {
    const str = typeof msg === 'object' ? JSON.stringify(msg, null, 2) : msg;
    console.log(str);
    fs.appendFileSync(logFile, str + '\n');
};

async function cleanupAndRecreate() {
    log(`\n--- Deep Cleaning Account for ${targetEmail} (${targetUsername}) ---`);

    // 1. Check for zombie profile by username
    log('Querying existing profiles...');
    const { data: profiles, error: profileCheckError } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', targetUsername);

    if (profileCheckError) {
        log(`Error querying profiles: ${profileCheckError.message}`);
    } else if (profiles && profiles.length > 0) {
        log(`Found ${profiles.length} existing profile(s) with username '${targetUsername}'.`);
        
        for (const p of profiles) {
            log(`Processing orphan profile ID: ${p.id}...`);

            // Clean dependent tables manually
            // Note: Some might fail if tables don't exist in schema, but we try anyway.
            const tablesToClean = [
                { name: 'conversation_members', col: 'user_id' },
                { name: 'messages', col: 'sender_id' },
                { name: 'shared_notes', col: 'shared_with_user_id' },
                { name: 'subscriptions', col: 'user_id' },
                { name: 'notes', col: 'owner_id' },
                { name: 'admin_audit_logs', col: 'admin_id' },
                { name: 'broadcasts', col: 'admin_id' } 
            ];

            for (const t of tablesToClean) {
                log(`  - Cleaning ${t.name}...`);
                try {
                    const { error: cleanError } = await supabase
                        .from(t.name)
                        .delete()
                        .eq(t.col, p.id);
                    
                    if (cleanError) {
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

    // 2. Check for auth user by email
    log('Listing users...');
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    // Find user by email
    const existingUser = users?.find(u => u.email === targetEmail);
    if (existingUser) {
        log(`Found existing auth user (ID: ${existingUser.id}). Deleting...`);
        const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id);
        if (deleteError) log(`Error deleting auth user: ${deleteError.message}`);
        else log('Auth user deleted.');
    } else {
        log('No existing auth user found via listUsers.');
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
}

cleanupAndRecreate().catch(err => log(`Global Error: ${err.message}`));
