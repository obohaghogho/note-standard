const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function verify() {
    console.log('--- FINAL VERIFICATION ---');
    const { data: ads, error } = await supabase.from('ads').select('id, title, destination_url, media_url, start_date, end_date');
    if (error) console.error(error);
    else {
        console.log(`Ads in DB: ${ads.length}`);
        ads.forEach(ad => {
            console.log(`- ${ad.title}`);
            console.log(`  Target: ${ad.destination_url}`);
            console.log(`  Media: ${ad.media_url}`);
            console.log(`  Dates: ${ad.start_date} to ${ad.end_date || 'forever'}`);
        });
    }
}
verify();
