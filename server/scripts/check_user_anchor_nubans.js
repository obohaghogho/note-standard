'use strict';

const supabase = require('../config/database');

async function checkRealUsersAnchorNubans() {
  console.log('========================================================================');
  console.log('   REAL USERS ANCHOR BAAS VIRTUAL ACCOUNTS AUDIT & HEALTH CHECK        ');
  console.log('========================================================================\n');

  const { data: dedicated, error: dErr } = await supabase
    .from('dedicated_accounts')
    .select('user_id, account_number, bank_name, account_name, provider, currency, created_at')
    .eq('provider', 'anchor');

  if (dErr) {
    console.error('Error fetching dedicated_accounts:', dErr);
    process.exit(1);
  }

  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, email, username, full_name, kyc_level, created_at')
    .order('created_at', { ascending: false });

  if (pErr) {
    console.error('Error fetching profiles:', pErr);
    process.exit(1);
  }

  const accountMap = new Map();
  for (const acc of dedicated) {
    accountMap.set(acc.user_id, acc);
  }

  // Filter out load test / automated test users
  const realProfiles = profiles.filter(p => {
    const email = (p.email || p.username || '').toLowerCase();
    return !email.includes('loadtest_') && !email.includes('test.com') && !email.includes('notestandard.test');
  });

  console.log(`Total Real User Accounts Found: ${realProfiles.length}\n`);

  const auditTable = [];
  let validCount = 0;

  for (const p of realProfiles) {
    const acc = accountMap.get(p.id);
    const email = p.email || p.username || 'No email';
    const name = p.full_name || p.username || 'No name';
    const hasAcc = Boolean(acc && acc.account_number && /^\d{10}$/.test(acc.account_number));
    
    if (hasAcc) validCount++;

    auditTable.push({
      'User Email': email,
      'Full Name': name,
      'KYC Tier': p.kyc_level ?? 0,
      'Anchor Status': hasAcc ? '✅ ACTIVE & FUNCTIONAL' : '⚠️ NO NUBAN',
      'Virtual NUBAN': acc ? acc.account_number : 'N/A',
      'Bank Partner': acc ? acc.bank_name : '9 Payment Service Bank (9PSB)',
      'Account Name': acc ? acc.account_name : 'N/A'
    });
  }

  console.table(auditTable);

  console.log('\n------------------------------------------------------------------------');
  console.log(`REAL USER METRICS:`);
  console.log(`- Total Real Users: ${realProfiles.length}`);
  console.log(`- Fully Provisioned Active NUBANs: ${validCount} / ${realProfiles.length} (${Math.round((validCount / (realProfiles.length || 1)) * 100)}%)`);
  console.log('------------------------------------------------------------------------\n');

  process.exit(0);
}

checkRealUsersAnchorNubans().catch(err => {
  console.error(err);
  process.exit(1);
});
