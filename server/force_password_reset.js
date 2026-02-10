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

async function updatePasswordDirectly() {
    const log = (msg) => console.log(msg);

    log(`\n--- Force Updating Password for ${targetEmail} ---`);

    // 1. Get user by email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    
    if (listError) {
        log(`Error listing users: ${listError.message}`);
        return;
    }

    const user = users.find(u => u.email === targetEmail);

    if (!user) {
        log('User not found!');
        return;
    }

    log(`User found (ID: ${user.id}). Updating password...`);

    // 2. Update password directly via Admin API
    const newPassword = 'Password123!';
    const { data, error: updateError } = await supabase.auth.admin.updateUserById(
        user.id,
        { password: newPassword }
    );

    if (updateError) {
        log(`Error updating password: ${updateError.message}`);
    } else {
        log('✅ Password updated successfully!');
        log(`New Password: ${newPassword}`);
        log('You can try logging in immediately.');
    }
}

updatePasswordDirectly();
