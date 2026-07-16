const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkProfiles() {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name')
        .limit(5);

    if (error) {
        console.error('Error fetching profiles:', error);
    } else {
        console.log('Sample Profiles:', JSON.stringify(data, null, 2));
    }
}

checkProfiles();
