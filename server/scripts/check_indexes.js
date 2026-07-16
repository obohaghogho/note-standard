const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

async function checkIndexes() {
    console.log('--- Checking Indexes ---');
    // Using a raw query via rpc if available, or just checking common patterns
    const tables = ['notes', 'shared_notes', 'team_members', 'ads', 'profiles'];
    for (const table of tables) {
        console.log(`\nTable: ${table}`);
        const { data, error } = await supabase.rpc('get_table_indexes', { p_table_name: table });
        if (error) {
            console.log(`- RPC failed: ${error.message}`);
        } else {
            console.log(data);
        }
    }
}
checkIndexes();
