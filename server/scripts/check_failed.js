const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkFailedTransactions() {
    const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('status', 'FAILED')
        .order('created_at', { ascending: false })
        .limit(5);

    if (error) {
        console.error('Error fetching transactions:', error);
        return;
    }

    console.log(`Recent Failed Transactions:`);
    data.forEach(tx => {
        console.log(`ID: ${tx.id}, Created: ${tx.created_at}, Currency: ${tx.currency}, Provider: ${tx.provider}, Type: ${tx.type}`);
        console.log(`Metadata:`, JSON.stringify(tx.metadata, null, 2));
        console.log('-------------------');
    });
}

checkFailedTransactions();
