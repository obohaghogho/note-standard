const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || "https://tngcvgisfctggvivcnva.supabase.co";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
    console.error('SUPABASE_SERVICE_ROLE_KEY environment variable required.');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
    console.log('Creating test users via Supabase Admin API...');

    const users = [
        { email: 'sender_test@notestandard.com', password: 'Password123!', name: 'Test Sender', username: 'testsender' },
        { email: 'recipient_test@notestandard.com', password: 'Password123!', name: 'Test Recipient', username: 'testrecipient' }
    ];

    for (const u of users) {
        let { data, error } = await supabase.auth.admin.createUser({
            email: u.email,
            password: u.password,
            email_confirm: true,
            user_metadata: { full_name: u.name, username: u.username }
        });

        if (error && error.message?.includes('already registered')) {
            console.log(`User ${u.email} already exists.`);
        } else if (error) {
            console.error(`Error creating ${u.email}:`, error.message);
        } else {
            console.log(`✓ Created user ${u.email} (${data.user.id})`);
            await supabase.from('profiles').upsert({
                id: data.user.id,
                email: u.email,
                username: u.username,
                full_name: u.name,
                is_online: false
            });
        }
    }
}

main();
