const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function checkAds() {
    console.log('--- ALL ADS ---');
    const { data: ads, error } = await supabase.from('ads').select('*');
    if (error) console.error(error);
    else {
        console.log(`Total: ${ads.length}`);
        ads.forEach(ad => {
            console.log(`ID: ${ad.id} | Title: "${ad.title}" | Status: ${ad.status} | Tags: ${JSON.stringify(ad.tags)}`);
        });
    }

    console.log('\n--- PROFILE PREFERENCES ---');
    const { data: profiles, error: pError } = await supabase.from('profiles').select('id, preferences').limit(5);
    if (pError) console.error(pError);
    else {
        profiles.forEach(p => console.log(`ID: ${p.id} | Offers: ${p.preferences?.offers}`));
    }
}
checkAds();
