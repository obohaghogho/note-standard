const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

async function listAll() {
    console.log('--- Listing Tables/Views ---');
    const { data: tables, error } = await supabase.rpc('get_tables'); // Hope this exists or use query
    if (error) {
        // Fallback to direct schema query if possible or just try known names
        console.error('RPC get_tables failed, searching for dashboard_stats specifically...');
        const possible = ['dashboard_stats', 'global_stats', 'app_stats', 'analytics_stats'];
        for (const name of possible) {
            const { data, error: err } = await supabase.from(name).select('id').limit(1);
            if (!err) console.log(`- ${name}: EXISTS`);
            else if (err.code !== '42P01') console.log(`- ${name}: Exists but Error ${err.code}`);
        }
    } else {
        console.log('Tables:', tables);
    }
}
listAll();
