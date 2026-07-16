const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env.development') });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function ensureProfile() {
    const userId = '23d27c92-e259-47f3-9bd1-ad938c32f797';
    
    console.log(`--- Checking Profile for User ID: ${userId} ---`);
    const { data: profile, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

    if (error) {
        console.error('Error checking profile:', JSON.stringify(error, null, 2));
        return;
    }

    if (!profile) {
        console.log('Profile missing. Creating one...');
        const { error: insertError } = await supabase
            .from('profiles')
            .insert({
                id: userId,
                username: 'chat_tester_v1',
                full_name: 'Chat Tester V1',
                updated_at: new Date()
            });

        if (insertError) {
            console.error('Error creating profile:', JSON.stringify(insertError, null, 2));
        } else {
            console.log('Profile created successfully');
        }
    } else {
        console.log('Profile exists:', profile.username);
    }
}

ensureProfile().catch(console.error);
