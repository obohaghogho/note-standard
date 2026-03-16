const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkMissingEmails() {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, email, username')
        .or('email.is.null,email.eq.""');

    if (error) {
        console.error('Error fetching profiles:', error);
    } else {
        console.log('Profiles with missing emails:', data.length);
        if (data.length > 0) {
            console.log(JSON.stringify(data, null, 2));
        }
    }
}

checkMissingEmails();
