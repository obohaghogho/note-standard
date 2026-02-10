const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function checkColumns() {
    const { data, error } = await supabase.rpc('get_table_columns', { table_name: 'ads' });
    
    if (error) {
        // Fallback: query a single row and check keys
        const { data: row, error: rowError } = await supabase.from('ads').select('*').limit(1).single();
        if (rowError) {
            console.error('Error fetching row:', rowError.message);
            // Try selecting * without single in case no rows
            const { data: rows, error: rowsError } = await supabase.from('ads').select('*').limit(1);
            if (rowsError) console.error('Error fetching rows:', rowsError.message);
            else if (rows.length > 0) console.log('Columns from row:', Object.keys(rows[0]));
            else console.log('No rows found in "ads" table to infer columns.');
        } else {
            console.log('Columns from row:', Object.keys(row));
        }
    } else {
        console.log('Columns:', data);
    }
}

checkColumns();
