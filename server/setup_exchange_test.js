require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
);

async function setupExchangeTest() {
    const email = `test_swap_${Date.now()}@example.com`;
    const password = 'Password123!';
    const username = `swapuser_${Math.random().toString(36).substring(2, 7)}`;

    console.log(`Setting up test user: ${email}`);

    try {
        // 1. Create User
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: {
                full_name: 'Swap Test User',
                username: username
            }
        });

        if (authError) throw authError;
        const userId = authData.user.id;
        console.log(`User created: ${userId}`);

        // 2. Ensure Profile exists (Trigger should handle this, but for safety)
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('id')
            .eq('id', userId)
            .single();
        
        if (profileError || !profile) {
            console.log('Manually creating profile...');
            await supabase.from('profiles').insert({
                id: userId,
                email,
                username,
                full_name: 'Swap Test User',
                is_verified: true
            });
        }

        // 3. Create Wallets
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
            if (walletError && walletError.code !== '23505') throw walletError;
        }

        // 4. Credit BTC Wallet
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
        console.log(`Email: ${email}`);
        console.log(`Password: ${password}`);
        console.log(`Username: ${username}`);
        console.log(`User ID: ${userId}`);
        console.log('Initial Balance: 0.1 BTC');
        console.log('----------------------\n');

    } catch (err) {
        console.error('Setup failed:', err);
    }
}

setupExchangeTest();
