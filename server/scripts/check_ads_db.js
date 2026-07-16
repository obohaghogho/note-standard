const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function checkAds() {
    console.log('--- Database Ads Check ---');
    console.log('Checking for ads in table "ads"...');

    const { data: ads, error } = await supabase
        .from('ads')
        .select('*');

    if (error) {
        console.error('Error fetching ads:', error.message);
        return;
    }

    console.log(`Total ads found: ${ads.length}`);
    
    const approved = ads.filter(a => a.status === 'approved');
    console.log(`Approved ads: ${approved.length}`);
    
    if (approved.length > 0) {
        approved.forEach(ad => {
            console.log(`- [${ad.id}] "${ad.title}" (Status: ${ad.status}, Tags: ${JSON.stringify(ad.tags)})`);
        });
    }

    const { data: profiles, error: pError } = await supabase
        .from('profiles')
        .select('id, preferences')
        .limit(5);
    
    if (pError) {
        console.error('Error fetching profiles:', pError.message);
    } else {
        console.log('\n--- Sample Profile Preferences ---');
        profiles.forEach(p => {
            console.log(`- [${p.id}] offers: ${p.preferences?.offers}`);
        });
    }
}

checkAds();
