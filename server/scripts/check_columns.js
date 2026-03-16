const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkViewColumns() {
    const { data, error } = await supabase
        .from('wallets')
        .select('*')
        .limit(1);

    if (error) {
        console.error('Error fetching from wallets view:', error);
    } else if (data && data.length > 0) {
        console.log('Columns in wallets view:', JSON.stringify(Object.keys(data[0])));
    } else {
        console.log('No data in wallets view, trying to fetch from wallets_store');
        const { data: storeData, error: storeError } = await supabase
            .from('wallets_store')
            .select('*')
            .limit(1);
        if (storeError) {
            console.error('Error fetching from wallets_store:', storeError);
        } else if (storeData && storeData.length > 0) {
            console.log('Columns in wallets_store:', JSON.stringify(Object.keys(storeData[0])));
        } else {
            console.log('No data in wallets or wallets_store to determine columns');
        }
    }
}

checkViewColumns();
