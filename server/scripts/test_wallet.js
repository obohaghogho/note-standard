const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testWalletInsert() {
    // Attempt to insert a test wallet for a non-existent currency to see if it works or which columns it's missing
    const { data, error } = await supabase
        .from('wallets_store')
        .insert({
            user_id: 'd8ec2e4a-e7cd-37e4-8452-162780631566', // Random UUID from earlier
            currency: 'TEST_CURR',
            network: 'test_net',
            address: 'test_address'
        })
        .select()
        .single();

    if (error) {
        console.error('Insert failed:', error);
    } else {
        console.log('Insert success:', data);
    }
}

testWalletInsert();
