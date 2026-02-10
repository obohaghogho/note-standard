require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
// Use SERVICE ROLE KEY to bypass RLS and delete profiles
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

const fs = require('fs');
const logFile = 'login_debug.log';

function log(msg) {
    console.log(msg);
    fs.appendFileSync(logFile, msg + '\n');
}

// Replace console.log with log
console.log = log;
console.error = log;

async function cleanupAndRecreate() {
    log(`\n--- Cleaning up account for ${targetEmail} (${targetUsername}) ---`);


    // 1. Check for zombie profile by username
    const { data: profiles, error: profileCheckError } = await supabase
        .from('profiles')
        .select('*')
        .eq('username', targetUsername);

    if (profileCheckError) {
        console.error('Error checking profiles:', profileCheckError.message);
    } else if (profiles && profiles.length > 0) {
        console.log(`Found ${profiles.length} existing profile(s) with username '${targetUsername}'.`);
        // Delete them!
        for (const p of profiles) {
            console.log(`Deleting orphan profile ID: ${p.id}...`);
            const { error: delError } = await supabase
                .from('profiles')
                .delete()
                .eq('id', p.id);
            if (delError) console.error(`Failed to delete profile ${p.id}:`, delError.message);
            else console.log(`Deleted profile ${p.id}.`);
        }
    } else {
        console.log('No conflicting profiles found for username.');
    }

    // 2. Check for auth user by email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    // Find user by email
    const existingUser = users?.find(u => u.email === targetEmail);
    if (existingUser) {
        console.log(`Found existing auth user (ID: ${existingUser.id}). Deleting...`);
        const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id);
        if (deleteError) console.error('Error deleting auth user:', deleteError.message);
        else console.log('Auth user deleted.');
    } else {
        console.log('No existing auth user found via listUsers.');
    }

    // 3. Create fresh user
    console.log('\n--- Creating fresh user ---');
    const { data, error: createError } = await supabase.auth.admin.createUser({
        email: targetEmail,
        password: newPassword,
        email_confirm: true,
        user_metadata: { full_name: 'Test User' }
    });

    if (createError) {
        console.error('❌ Error creating user:', createError.message);
        console.log('Ensure the database trigger is not failing on something else.');
    } else {
        console.log('✅ User created successfully!');
        console.log(`Email: ${targetEmail}`);
        console.log(`Password: ${newPassword}`);
    }
}

cleanupAndRecreate();
