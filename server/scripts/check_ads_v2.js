const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function checkAds() {
    console.log('--- Database Ads Check ---');
    const { data: ads, error } = await supabase.from('ads').select('id, title, status, tags');
    if (error) console.error('Error ads:', error.message);
    else {
        console.log(`Total ads: ${ads.length}`);
        ads.forEach(ad => console.log(`- ${ad.id}: "${ad.title}" [${ad.status}] tags: ${JSON.stringify(ad.tags)}`));
    }

    console.log('\n--- Profiles Preferences Check ---');
    const { data: profiles, error: pError } = await supabase.from('profiles').select('id, preferences').limit(10);
    if (pError) console.error('Error profiles:', pError.message);
    else {
        profiles.forEach(p => console.log(`- ${p.id}: offers=${p.preferences?.offers}`));
    }
}

checkAds();
