'use strict';

const supabase = require('../config/database');
const anchorService = require('../services/anchorService');
const logger = require('../utils/logger');

async function provisionAnchorForAllUsers() {
  console.log('========================================================================');
  console.log('  PROVISIONING ANCHOR VIRTUAL ACCOUNTS FOR ALL REAL PLATFORM USERS     ');
  console.log('========================================================================\n');

  // Fetch all dedicated accounts
  const { data: dedicated } = await supabase
    .from('dedicated_accounts')
    .select('user_id, account_number')
    .eq('provider', 'anchor');

  const existingMap = new Set((dedicated || []).filter(d => d.account_number).map(d => d.user_id));

  // Fetch all real user profiles
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, username, full_name, phone')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch profiles:', error);
    process.exit(1);
  }

  const realUsers = profiles.filter(p => {
    const email = (p.email || p.username || '').toLowerCase();
    return !email.includes('loadtest_') && !email.includes('test.com') && !email.includes('notestandard.test');
  });

  console.log(`Total real users needing Anchor check: ${realUsers.length}`);

  let newlyProvisioned = 0;
  let skipped = 0;
  let errors = 0;

  for (const user of realUsers) {
    if (existingMap.has(user.id)) {
      skipped++;
      continue;
    }

    const email = user.email || `${user.username || 'user'}@notestandard.com`;
    const nameParts = (user.full_name || user.username || 'User Customer').trim().split(/\s+/);
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.slice(1).join(' ') || 'Customer';

    console.log(`[PROVISIONING] Provisioning Anchor NUBAN for user: ${email} (${user.id})...`);

    try {
      const account = await anchorService.createVirtualAccount({
        userId: user.id,
        email,
        firstName,
        lastName,
        phone: user.phone
      });

      if (account && account.account_number) {
        newlyProvisioned++;
        console.log(`✅ [SUCCESS] Created Anchor NUBAN: ${account.account_number} (${account.bank_name || '9PSB'}) for ${email}`);
      } else {
        errors++;
        console.error(`❌ [FAILED] Provisioning returned invalid payload for ${email}`);
      }
    } catch (err) {
      errors++;
      console.error(`❌ [ERROR] Exception provisioning for ${email}: ${err.message}`);
    }
  }

  console.log('\n------------------------------------------------------------------------');
  console.log(`BULK PROVISIONING SUMMARY:`);
  console.log(`- Already Active: ${skipped}`);
  console.log(`- Newly Provisioned: ${newlyProvisioned}`);
  console.log(`- Provisioning Errors: ${errors}`);
  console.log(`- Total Real Users with Anchor NUBAN: ${skipped + newlyProvisioned} / ${realUsers.length}`);
  console.log('------------------------------------------------------------------------\n');

  process.exit(0);
}

provisionAnchorForAllUsers().catch(err => {
  console.error('Unhandled error during bulk provisioning:', err);
  process.exit(1);
});
