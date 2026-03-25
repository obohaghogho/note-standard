const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.development') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function listUsers() {
    console.log('--- Existing Users ---');
    const { data: userData, error: userError } = await supabase.auth.admin.listUsers();
    if (userError) {
        console.error('Error listing users:', JSON.stringify(userError, null, 2));
        return;
    }

    userData.users.forEach(u => {
        console.log(`Email: ${u.email}, ID: ${u.id}`);
    });
}

listUsers().catch(console.error);
