const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function checkWallets() {
    const { data, error } = await supabase
        .from('wallets_store')
        .select('currency, network')
        .limit(10);
    
    if (error) {
        console.error('Error:', error);
    } else {
        console.log('Wallets:', JSON.stringify(data, null, 2));
    }
}

checkWallets();
