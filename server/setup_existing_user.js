require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

async function setupExistingUser() {
    const userId = '23d27c92-e259-47f3-9bd1-ad938c32f797'; 
    const email = 'valid.email.user.12345@gmail.com';

    try {
        // 1. Ensure Profile exists
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .maybeSingle();
        
        if (profileError || !profile) {
            console.log('Manually creating profile...');
            await supabase.from('profiles').insert({
                id: userId,
                email,
                username: 'swaptestuser123',
                full_name: 'Swap Test User',
                is_verified: true,
                role: 'user'
            });
        }

        // 2. Create Wallets
        console.log('Creating wallets...');
        const currencies = ['BTC', 'USD', 'ETH'];
        for (const cur of currencies) {
            const { error: walletError } = await supabase
                .from('wallets_store')
                .insert({
                    user_id: userId,
                    currency: cur,
                    network: 'native',
                    balance: 0,
                    available_balance: 0,
                    address: uuidv4(),
                    provider: 'internal'
                });
            if (walletError && walletError.code !== '23505') {
                console.error(`Error creating ${cur} wallet:`, walletError);
            }
        }

        // 3. Credit BTC Wallet
        console.log('Crediting BTC wallet...');
        const { data: btcWallet, error: btcError } = await supabase
            .from('wallets_store')
            .select('id')
            .eq('user_id', userId)
            .eq('currency', 'BTC')
            .single();
        
        if (btcError) throw btcError;

        const { error: creditError } = await supabase
            .from('wallets_store')
            .update({
                balance: 0.1,
                available_balance: 0.1,
                updated_at: new Date().toISOString()
            })
            .eq('id', btcWallet.id);
        
        if (creditError) throw creditError;

        console.log('\n--- SETUP COMPLETE ---');
        console.log(`User ID: ${userId}`);
        console.log('Initial Balance: 0.1 BTC');

    } catch (err) {
        console.error('Setup failed:', err);
    }
}

setupExistingUser();
