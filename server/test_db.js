
const path = require('path');
require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function test() {
    console.log('Testing Supabase connection...');
    console.log('URL:', process.env.SUPABASE_URL);
    try {
        const start = Date.now();
        const { data, error } = await supabase.from('profiles').select('count', { count: 'exact', head: true });
        const duration = Date.now() - start;
        if (error) {
            console.error('Connection failed:', error.message);
        } else {
            console.log('Connection successful!', { count: data, duration: `${duration}ms` });
        }
    } catch (err) {
        console.error('Unexpected error:', err);
    }
}

test();
