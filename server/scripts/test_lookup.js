const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

async function testRealLookup() {
    // 1. Get a user who has a wallet
    const { data: sampleWallet } = await supabase
        .from('wallets_store')
        .select('user_id, currency, network')
        .limit(1)
        .single();
    
    if (!sampleWallet) {
        console.log('No wallets found in DB');
        return;
    }

    const { user_id, currency, network } = sampleWallet;
    const lookupNetwork = network || 'native';

    console.log(`Testing real lookup for User: ${user_id}, Currency: ${currency}, DB Network: ${network}, Lookup Network: ${lookupNetwork}...`);

    const { data, error } = await supabase
        .from('wallets_store')
        .select('id, network')
        .eq('user_id', user_id)
        .eq('currency', currency)
        .or(`network.eq.${lookupNetwork},network.is.null`)
        .maybeSingle();

    if (error) {
        console.error('Lookup Error:', error);
    } else {
        console.log('Result:', data);
    }
}

testRealLookup();
