const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function countAds() {
    const { data: ads, error } = await supabase.from('ads').select('status');
    if (error) console.error(error);
    else {
        const counts = ads.reduce((acc, ad) => {
            acc[ad.status] = (acc[acc.status] || 0) + 1;
            return acc;
        }, {});
        console.log('Ads status counts:', counts);
    }
}
countAds();
