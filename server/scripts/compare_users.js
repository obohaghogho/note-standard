const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function compareUsers() {
    // 1. Get all profiles
    const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, email');
    
    if (profileError) {
        console.error('Error fetching profiles:', profileError);
        return;
    }

    // 2. Get all auth users
    const { data: { users }, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
        console.error('Error fetching auth users:', authError);
        return;
    }

    const profileIds = new Set(profiles.map(p => p.id));
    const missingProfiles = users.filter(u => !profileIds.has(u.id));

    console.log('Total Auth Users:', users.length);
    console.log('Total Profiles:', profiles.length);
    console.log('Users missing profiles:', missingProfiles.length);

    if (missingProfiles.length > 0) {
        console.log('Missing Profiles Details:');
        missingProfiles.forEach(u => {
            console.log(`- ID: ${u.id}, Email: ${u.email}`);
        });
    }
}

compareUsers();
