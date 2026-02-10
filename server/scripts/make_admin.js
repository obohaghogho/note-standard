const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const dotenv = require('dotenv');

// Try loading .env from server root and project root
dotenv.config({ path: path.join(__dirname, '../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Error: Missing SUPABASE_URL or SUPABASE_SERVICE_KEY');
    console.log('Current directory:', __dirname);
    console.log('Env loaded from:', path.join(__dirname, '../.env'));
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function makeAdmin(searchTerm) {
    console.log(`Searching for user matching: "${searchTerm}"...`);

    // 1. Search in profiles
    const { data: profiles, error } = await supabase
        .from('profiles')
        .select('*')
        .ilike('full_name', `%${searchTerm}%`);

    if (error) {
        console.error('Error searching profiles:', error);
        return;
    }

    if (!profiles || profiles.length === 0) {
        console.log('No user found matching that name.');
        return;
    }

    if (profiles.length > 1) {
        console.log('Found multiple users:');
        profiles.forEach(p => console.log(`- ${p.full_name} (${p.email})`));
        console.log('Please be more specific.');
        return;
    }

    const user = profiles[0];
    console.log(`Found user: ${user.full_name} (${user.id})`);
    console.log(`Current role: ${user.role}`);

    // 2. Update role
    const { error: updateError } = await supabase
        .from('profiles')
        .update({ role: 'admin' })
        .eq('id', user.id);

    if (updateError) {
        console.error('Failed to update role:', updateError);
    } else {
        console.log('✅ Successfully promoted to ADMIN');
    }
}

const searchTerm = process.argv[2] || 'oboh aghogho jossy';
makeAdmin(searchTerm);
