const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY
);

async function checkCols() {
    console.log('--- Checking shared_notes columns ---');
    // RPC or query
    const { data, error } = await supabase.from('shared_notes').select('*').limit(1);
    if (error) {
        console.error('Error:', error.message);
    } else if (data && data.length > 0) {
        console.log('Columns found:', Object.keys(data[0]));
    } else {
        console.log('Table exists but is empty. Trying to guess columns via error...');
        // Try selecting the problematic column
        const { error: err2 } = await supabase.from('shared_notes').select('shared_with_user_id').limit(1);
        console.log('shared_with_user_id exists:', !err2);
        
        const { error: err3 } = await supabase.from('shared_notes').select('team_id').limit(1);
        console.log('team_id exists:', !err3);

        const { error: err4 } = await supabase.from('shared_notes').select('shared_by').limit(1);
        console.log('shared_by exists:', !err4);
    }
}
checkCols();
