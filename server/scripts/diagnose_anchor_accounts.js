#!/usr/bin/env node
/**
 * Anchor Virtual Account Diagnostic — traces the exact account data
 * from both the Anchor API and the local database to identify why
 * the account number is "invalid" at 9PSB.
 */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const axios = require('axios');

const ANCHOR_KEY = process.env.ANCHOR_SECRET_KEY;
const ANCHOR_URL = process.env.ANCHOR_BASE_URL || 'https://api.getanchor.co/api/v1';

const client = axios.create({
  baseURL: ANCHOR_URL,
  headers: {
    'x-anchor-key': ANCHOR_KEY,
    Authorization: `Bearer ${ANCHOR_KEY}`,
    'Content-Type': 'application/json',
  },
  timeout: 15000,
});

async function run() {
  console.log('='.repeat(70));
  console.log('ANCHOR VIRTUAL ACCOUNT DIAGNOSTIC');
  console.log('='.repeat(70));
  console.log(`ENV:       ${process.env.ANCHOR_ENV}`);
  console.log(`BASE_URL:  ${ANCHOR_URL}`);
  console.log(`KEY:       ${ANCHOR_KEY ? ANCHOR_KEY.substring(0, 12) + '...' : 'MISSING'}`);
  console.log('');

  // 1. Test API connectivity
  console.log('-- Step 1: API Connectivity --');
  try {
    const healthRes = await client.get('/banks');
    const banks = healthRes.data?.data || [];
    console.log(`OK: API connected. ${banks.length} banks in response.`);
    const psb = banks.find(b => {
      const name = (b.attributes?.name || b.name || '').toUpperCase();
      return name.includes('9 PAYMENT') || name.includes('9PSB') || name.includes('NINE PAYMENT');
    });
    if (psb) {
      console.log(`OK: 9PSB found: "${psb.attributes?.name || psb.name}" (NIP code: ${psb.attributes?.nipCode || psb.nipCode || psb.code || 'N/A'})`);
    } else {
      console.log(`WARN: 9PSB NOT found. First 10 banks:`);
      banks.slice(0, 10).forEach(b => {
        const attr = b.attributes || b;
        console.log(`   - ${attr.name} (code: ${attr.nipCode || attr.code || 'N/A'})`);
      });
    }
  } catch (err) {
    console.log(`FAIL: API connection: ${err.response?.status} ${err.response?.data?.message || err.message}`);
    if (err.response?.status === 401 || err.response?.status === 403) {
      console.log('   -> API key is invalid or expired.');
    }
    console.log('   Full error:', JSON.stringify(err.response?.data || err.message, null, 2));
  }

  // 2. List all Virtual NUBANs from Anchor API
  console.log('\n-- Step 2: Virtual NUBANs from Anchor API --');
  let virtualNubans = [];
  try {
    const vnRes = await client.get('/virtual-nubans');
    virtualNubans = vnRes.data?.data || [];
    console.log(`Found ${virtualNubans.length} Virtual NUBAN(s):`);
    virtualNubans.forEach((vn, i) => {
      const attr = vn.attributes || vn;
      console.log(`\n  [${i}] ID: ${vn.id}`);
      console.log(`      Account Number: ${attr.accountNumber || 'N/A'}`);
      console.log(`      Account Name:   ${attr.accountName || 'N/A'}`);
      console.log(`      Status:         ${attr.status || 'N/A'}`);
      console.log(`      Bank:           ${JSON.stringify(attr.bank || 'N/A')}`);
      console.log(`      Created:        ${attr.createdAt || vn.createdAt || 'N/A'}`);
      console.log(`      Permanent:      ${attr.permanent || 'N/A'}`);
      console.log(`      Full Attributes: ${JSON.stringify(attr, null, 8).substring(0, 500)}`);
    });
    if (virtualNubans.length === 0) {
      console.log('   WARN: No Virtual NUBANs exist on this Anchor account!');
    }
  } catch (err) {
    console.log(`FAIL: Virtual NUBAN list: ${err.response?.status} ${err.response?.data?.message || err.message}`);
    console.log('   Full error:', JSON.stringify(err.response?.data || err.message, null, 2));
  }

  // 3. List Anchor Deposit Accounts
  console.log('\n-- Step 3: Anchor Deposit/Settlement Accounts --');
  try {
    const accRes = await client.get('/accounts');
    const accounts = accRes.data?.data || [];
    console.log(`Found ${accounts.length} Anchor account(s):`);
    accounts.forEach((acc, i) => {
      const attr = acc.attributes || acc;
      console.log(`\n  [${i}] ID:     ${acc.id}`);
      console.log(`      Type:   ${attr.type || 'N/A'}`);
      console.log(`      Status: ${attr.status || 'N/A'}`);
      console.log(`      Number: ${attr.accountNumber || 'N/A'}`);
      console.log(`      Name:   ${attr.accountName || 'N/A'}`);
      console.log(`      Bank:   ${JSON.stringify(attr.bank || 'N/A')}`);
      console.log(`      Balance: ${JSON.stringify(attr.balance || attr.availableBalance || 'N/A')}`);
    });
  } catch (err) {
    console.log(`FAIL: Accounts list: ${err.response?.status} ${err.response?.data?.message || err.message}`);
    console.log('   Full error:', JSON.stringify(err.response?.data || err.message, null, 2));
  }

  // 4. List Anchor Customers
  console.log('\n-- Step 4: Anchor Customers --');
  try {
    const custRes = await client.get('/customers');
    const customers = custRes.data?.data || [];
    console.log(`Found ${customers.length} customer(s):`);
    customers.slice(0, 5).forEach((c, i) => {
      const attr = c.attributes || c;
      console.log(`  [${i}] ID: ${c.id}, Email: ${attr.email || 'N/A'}, Status: ${attr.status || 'N/A'}`);
    });
  } catch (err) {
    console.log(`FAIL: Customer list: ${err.response?.status} ${err.response?.data?.message || err.message}`);
  }

  // 5. Check database records
  console.log('\n-- Step 5: Database dedicated_accounts (Anchor) --');
  try {
    const supabase = require('../config/database');
    const { data: dbAccounts, error } = await supabase
      .from('dedicated_accounts')
      .select('id, user_id, provider, bank_name, account_number, account_name, currency, status, provider_account_id, created_at, updated_at')
      .eq('provider', 'anchor')
      .limit(20);

    if (error) {
      console.log(`FAIL: DB query: ${error.message}`);
    } else {
      console.log(`Found ${(dbAccounts || []).length} Anchor record(s) in dedicated_accounts:`);
      (dbAccounts || []).forEach((r, i) => {
        console.log(`\n  [${i}] user_id:          ${r.user_id}`);
        console.log(`      bank_name:         ${r.bank_name}`);
        console.log(`      account_number:    ${r.account_number}`);
        console.log(`      account_name:      ${r.account_name}`);
        console.log(`      currency:          ${r.currency}`);
        console.log(`      status:            ${r.status}`);
        console.log(`      provider_acct_id:  ${r.provider_account_id}`);
        console.log(`      created_at:        ${r.created_at}`);
        console.log(`      updated_at:        ${r.updated_at}`);

        const isValidNuban = r.account_number && /^\d{10}$/.test(r.account_number);
        const isProvidus = r.bank_name?.toUpperCase().includes('PROVIDUS');
        if (!isValidNuban) console.log(`      WARN: INVALID NUBAN FORMAT`);
        if (isProvidus) console.log(`      WARN: STALE PROVIDUS BANK NAME`);

        const matchInApi = virtualNubans.find(vn => {
          const attr = vn.attributes || vn;
          return attr.accountNumber === r.account_number;
        });
        if (matchInApi) {
          const mAttr = matchInApi.attributes || matchInApi;
          console.log(`      OK: Matches API Virtual NUBAN (status: ${mAttr.status})`);
        } else {
          console.log(`      FAIL: NOT FOUND in Anchor API Virtual NUBANs - this number is likely invalid`);
        }
      });
    }
  } catch (dbErr) {
    console.log(`FAIL: Database check: ${dbErr.message}`);
  }

  // 6. Try to verify the account numbers via NIP
  console.log('\n-- Step 6: NIP Account Verification --');
  for (const vn of virtualNubans) {
    const attr = vn.attributes || vn;
    const accNo = attr.accountNumber;
    const bankCode = attr.bank?.nipCode || attr.bank?.code || '';
    if (!accNo || !bankCode) {
      console.log(`   Skipping ${accNo || 'N/A'} (no bank code)`);
      continue;
    }
    try {
      const verifyRes = await client.get('/transfers/verify-account', {
        params: { accountNumber: accNo, bankCode: bankCode }
      });
      const vData = verifyRes.data?.data || verifyRes.data || {};
      console.log(`   OK: ${accNo} @ ${bankCode} -> ${vData.accountName || 'resolved OK'}`);
    } catch (verifyErr) {
      console.log(`   FAIL: ${accNo} @ ${bankCode} -> ${verifyErr.response?.data?.message || verifyErr.message}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('DIAGNOSTIC COMPLETE');
  console.log('='.repeat(70));
  process.exit(0);
}

run().catch(err => {
  console.error('Fatal diagnostic error:', err);
  process.exit(1);
});
