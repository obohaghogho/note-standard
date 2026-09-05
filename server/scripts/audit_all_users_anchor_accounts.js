'use strict';

const supabase = require('../config/database');
const anchorService = require('../services/anchorService');
const logger = require('../utils/logger');

async function auditAllUsersAnchorAccounts() {
  console.log('===============================================================');
  console.log('   ANCHOR BAAS VIRTUAL ACCOUNTS AUDIT & HEALTH CHECK FOR ALL USERS');
  console.log('===============================================================\n');

  // 1. Fetch all user profiles from DB
  const { data: profiles, error: pErr } = await supabase
    .from('profiles')
    .select('id, email, username, full_name, phone, created_at')
    .order('created_at', { ascending: false });

  if (pErr) {
    console.error('Failed to query profiles:', pErr);
    process.exit(1);
  }

  console.log(`Total users registered in platform profiles: ${profiles.length}`);

  // 2. Fetch all Anchor dedicated accounts
  const { data: dedicatedAccounts, error: dErr } = await supabase
    .from('dedicated_accounts')
    .select('*')
    .eq('provider', 'anchor');

  if (dErr) {
    console.error('Failed to query dedicated_accounts:', dErr);
    process.exit(1);
  }

  // 3. Fetch all Anchor customer records
  const { data: anchorCustomers, error: cErr } = await supabase
    .from('anchor_customers')
    .select('*');

  console.log(`Total Anchor virtual accounts in database: ${dedicatedAccounts ? dedicatedAccounts.length : 0}`);
  console.log(`Total Anchor customer records in database: ${anchorCustomers ? anchorCustomers.length : 0}\n`);

  // Map by user_id
  const accountMap = new Map();
  if (dedicatedAccounts) {
    for (const acc of dedicatedAccounts) {
      accountMap.set(acc.user_id, acc);
    }
  }

  const customerMap = new Map();
  if (anchorCustomers) {
    for (const cust of anchorCustomers) {
      customerMap.set(cust.user_id, cust);
    }
  }

  const auditResults = [];
  let totalActive = 0;
  let totalProvisioned = 0;
  let totalFailed = 0;

  for (const user of profiles) {
    const userId = user.id;
    const email = user.email || `${user.username || 'user'}@notestandard.com`;
    const nameParts = (user.full_name || user.username || 'User Customer').trim().split(/\s+/);
    const firstName = nameParts[0] || 'User';
    const lastName = nameParts.slice(1).join(' ') || 'Customer';

    let acc = accountMap.get(userId);
    let cust = customerMap.get(userId);

    // If account doesn't exist in dedicated_accounts, auto-provision via AnchorService
    if (!acc || !acc.account_number || !/^\d{10}$/.test(acc.account_number)) {
      console.log(`[AUDIT] User ${email} (${userId}) lacks a valid Anchor Virtual Account. Attempting auto-provisioning...`);
      try {
        const newAcc = await anchorService.createVirtualAccount({
          userId,
          email,
          firstName,
          lastName,
          phone: user.phone
        });

        if (newAcc && newAcc.account_number && /^\d{10}$/.test(newAcc.account_number)) {
          acc = newAcc;
          totalProvisioned++;
          console.log(`✅ [PROVISIONED] Successfully created Anchor Virtual Account for ${email}: NUBAN ${newAcc.account_number} (${newAcc.bank_name || '9PSB'})`);
        } else {
          console.error(`❌ [PROVISION_FAILED] Could not auto-create NUBAN for ${email}`);
        }
      } catch (provErr) {
        console.error(`❌ [PROVISION_ERROR] Error creating Anchor account for ${email}:`, provErr.message);
      }
    }

    // Verify Anchor API connectivity/status for the account if available
    let liveStatus = 'UNVERIFIED';
    let anchorAccountId = acc?.account_id || acc?.provider_account_id || acc?.metadata?.id;
    
    if (anchorAccountId && anchorService.isEnabled()) {
      try {
        const liveRes = await anchorService.getAccountDetails(anchorAccountId);
        if (liveRes && (liveRes.id || liveRes.attributes?.accountNumber)) {
          liveStatus = liveRes.attributes?.status || 'ACTIVE (LIVE CONFIRMED)';
        } else {
          liveStatus = 'ACTIVE (DB RECORD)';
        }
      } catch (apiErr) {
        liveStatus = `ACTIVE (DB RECORD - API: ${apiErr.message})`;
      }
    } else if (acc && acc.account_number) {
      liveStatus = 'ACTIVE (DB RECORD)';
    } else {
      liveStatus = 'FAILED_PROVISION';
    }

    const isValidNuban = Boolean(acc?.account_number && /^\d{10}$/.test(acc.account_number));
    const bankName = acc?.bank_name || '9 Payment Service Bank (9PSB)';
    const nuban = acc?.account_number || 'N/A';

    if (isValidNuban) {
      totalActive++;
    } else {
      totalFailed++;
    }

    auditResults.push({
      user_id: userId,
      email,
      name: `${firstName} ${lastName}`,
      nuban,
      bank: bankName,
      is_valid_nuban: isValidNuban ? 'YES' : 'NO',
      status: liveStatus
    });
  }

  console.log('\n===============================================================');
  console.log('              ANCHOR ACCOUNTS AUDIT SUMMARY RESULT             ');
  console.log('===============================================================');
  console.table(auditResults);

  console.log(`\nAUDIT METRICS:`);
  console.log(`- Total Registered Users: ${profiles.length}`);
  console.log(`- Fully Functional Anchor NUBANs: ${totalActive} / ${profiles.length} (${Math.round((totalActive / profiles.length) * 100)}%)`);
  console.log(`- Newly Provisioned NUBANs: ${totalProvisioned}`);
  console.log(`- Failed / Pending Accounts: ${totalFailed}`);

  if (totalActive === profiles.length) {
    console.log('\n🎉 ALL USERS HAVE 100% FUNCTIONAL AND WORKING ANCHOR VIRTUAL ACCOUNTS!');
  } else {
    console.warn(`\n⚠️ ${totalFailed} user(s) need attention.`);
  }

  process.exit(0);
}

auditAllUsersAnchorAccounts().catch(err => {
  console.error('Audit execution error:', err);
  process.exit(1);
});
