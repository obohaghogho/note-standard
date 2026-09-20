const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: 'server/.env' });
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const JENNIFER_ID = 'a1134fbf-3054-4005-aaa3-b86382207106';
const CARLY_ID = '4005e54f-5f05-47f5-97f8-8d0391fff9a4';

async function main() {
  console.log('====================================================');
  console.log('CHECKING V2 INSTALLATION ACCOUNTS & DEVICE INSTALLATIONS');
  console.log('====================================================\n');

  // 1. Query installation_accounts for Jennifer G & Carly
  const { data: instAccs, error: iErr } = await supabase
    .from('installation_accounts')
    .select('*, device_installations(*)')
    .in('user_id', [CARLY_ID, JENNIFER_ID]);

  console.log('--- INSTALLATION ACCOUNTS (V2 Push Routing) ---');
  if (iErr) {
    console.error('Error fetching installation_accounts:', iErr.message);
  } else {
    console.log(`Found ${instAccs ? instAccs.length : 0} installation_accounts rows:`);
    console.table(instAccs ? instAccs.map(a => ({
      id: a.id,
      user_id: a.user_id === CARLY_ID ? 'Carly' : 'Jennifer G',
      installation_id: a.installation_id,
      last_active_at: a.last_active_at,
      status: a.status,
      push_endpoint: a.device_installations ? a.device_installations.push_endpoint : 'NONE',
      platform: a.device_installations ? a.device_installations.platform : 'NONE',
      endpoint_status: a.device_installations ? a.device_installations.endpoint_status : 'NONE'
    })) : []);
  }

  // 2. Query user_devices or device_installations directly if mapped
  const { data: allInstalls } = await supabase
    .from('device_installations')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('\n--- RECENT DEVICE INSTALLATIONS (All Users) ---');
  console.table(allInstalls ? allInstalls.map(d => ({
    installation_id: d.installation_id,
    platform: d.platform,
    endpoint_status: d.endpoint_status,
    push_endpoint: d.push_endpoint ? (d.push_endpoint.substring(0, 30) + '...') : 'NONE',
    updated_at: d.updated_at
  })) : []);
}

main().catch(console.error);
