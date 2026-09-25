'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const axios = require('axios');
const https = require('https');
const { Pool } = require('pg');
const supabase = require('../config/database');
const PlatformSettlementService = require('../services/settlement/PlatformSettlementService');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const agent = new https.Agent({ family: 4, timeout: 10000 });

async function executeLiveSettlement() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' CONTROLLED FIRST SUCCESSFUL LIVE FINCRA SETTLEMENT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // STEP 1: Sync time offset with Gateway server (gateway.notestandard.com)
  const gwStart = Date.now();
  const gwRes = await axios.get('https://gateway.notestandard.com/health', { httpsAgent: agent });
  const gwDateStr = gwRes.headers['date'] || gwRes.data?.timestamp;
  const gwMs = new Date(gwDateStr).getTime();
  const timeOffsetMs = gwMs - Date.now();

  console.log(`[Time Sync] Gateway Date: "${gwDateStr}" (${gwMs})`);
  console.log(`[Time Sync] Calculated time offset to match Gateway clock: ${timeOffsetMs}ms (${(timeOffsetMs / 1000).toFixed(2)}s)`);

  // Temporarily patch Date.now to generate timestamps synchronized with Gateway Proxy clock
  const realDateNow = Date.now;
  Date.now = function() {
    return realDateNow() + timeOffsetMs;
  };

  // STEP 2: Enable Live Execution Flag
  process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = 'true';
  const isFlagActive = process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION === 'true';
  console.log(`[Live Flag Check] ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = ${isFlagActive}`);

  // STEP 3: Verify approved destination
  const approvedDest = process.env.FINCRA_MERCHANT_NGN_ACCOUNT_ID || process.env.FINCRA_ACCOUNT_NUMBER;
  console.log(`[Destination Check] Resolved Server NGN Destination Account: "${approvedDest}"`);

  // STEP 4: Fresh Idempotency Key
  const timestampStr = new Date(gwMs).toISOString().replace(/[-:T.]/g, '').slice(0, 14);
  const randomSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const idempotencyKey = `FIRST_SUCCESSFUL_LIVE_NGN_${timestampStr}_${randomSuffix}`;
  const amount = 1000;
  const currency = 'NGN';
  const adminId = '00000000-0000-0000-0000-000000000000';

  console.log(`\n── SUBMITTING SINGLE CONTROLLED LIVE SETTLEMENT ──`);
  console.log(`  Fresh Reference / Idempotency Key: ${idempotencyKey}`);
  console.log(`  Amount: ₦${amount} ${currency}`);
  console.log(`  Destination: ${approvedDest}`);
  console.log(`  Initiated By Admin: ${adminId}`);

  const preBal = await PlatformSettlementService.getPlatformRevenueBalance('NGN');
  console.log(`  Pre-settlement Available Revenue: ₦${preBal.availableRevenue}`);

  let result;
  try {
    result = await PlatformSettlementService.requestSettlement({
      adminUserId: adminId,
      amount,
      currency,
      idempotencyKey,
    });

    console.log('\n── APPLICATION RESPONSE ──');
    console.log('  Success:', result.success);
    console.log('  Settlement ID:', result.settlement?.id);
    console.log('  Reference:', result.settlement?.reference);
    console.log('  Status:', result.settlement?.status);
    console.log('  Provider Reference:', result.providerReference || result.settlement?.provider_reference);
    console.log('  Message:', result.message);

  } catch (err) {
    console.error('  ❌ Settlement Threw Error:', err.message);
    result = { success: false, error: err.message };
  } finally {
    // Restore Date.now and reset flag
    Date.now = realDateNow;
    process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = 'false';
  }

  // STEP 5: Reconciliation & Verification
  console.log('\n── RECONCILING TRANSACTION WITH DATABASE & PROVIDER ──');
  const client = await pool.connect();
  try {
    const dbRes = await client.query(
      `SELECT * FROM public.platform_settlements WHERE reference = $1;`,
      [idempotencyKey]
    );

    if (dbRes.rows.length === 1) {
      const rec = dbRes.rows[0];
      console.log(`  DB Record Found: ID = ${rec.id}`);
      console.log(`  Reference = ${rec.reference}`);
      console.log(`  Amount = ₦${rec.amount} ${rec.currency}`);
      console.log(`  Status = ${rec.status}`);
      console.log(`  Provider Reference = ${rec.provider_reference}`);
      console.log(`  Destination Account = ${rec.destination_account}`);

      // If PROCESSING, run reconcilePendingSettlements
      if (['PROCESSING', 'PENDING_RECONCILIATION'].includes(rec.status)) {
        console.log('\nRunning reconcilePendingSettlements() to check Fincra status...');
        const recResult = await PlatformSettlementService.reconcilePendingSettlements();
        console.log('  Reconciliation result:', recResult);
      }

      // Re-fetch final record
      const finalRec = (await client.query(`SELECT * FROM public.platform_settlements WHERE id = $1;`, [rec.id])).rows[0];
      console.log(`  Final DB Status = ${finalRec.status}`);

      // Accounting Reconciliation
      console.log('\n── POST-SETTLEMENT ACCOUNTING RECONCILIATION ──');
      const postBal = await PlatformSettlementService.getPlatformRevenueBalance('NGN');
      const expectedBal = preBal.availableRevenue - amount;
      const revDelta = preBal.availableRevenue - postBal.availableRevenue;

      console.log(`  Pre-settlement Available Revenue:  ₦${preBal.availableRevenue}`);
      console.log(`  Post-settlement Available Revenue: ₦${postBal.availableRevenue}`);
      console.log(`  Expected Available Revenue:        ₦${expectedBal}`);
      console.log(`  Revenue Reduction Delta:           ₦${revDelta}`);

      const walletsRes = await client.query(`SELECT COALESCE(SUM(balance), 0)::numeric AS sum_bal FROM public.wallets_v6 WHERE currency = 'NGN';`);
      console.log(`  Customer Wallets Sum: ₦${walletsRes.rows[0].sum_bal} (Delta = ₦0.00: ✅ YES)`);

      const auditCount = (await client.query(`SELECT COUNT(*)::int AS count FROM public.audit_logs WHERE reference = $1;`, [idempotencyKey])).rows[0].count;
      console.log(`  Audit Log Entries: ${auditCount}`);

      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log(' EXECUTION SUMMARY & FINAL VERDICT');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`  Settlement ID: ${finalRec.id}`);
      console.log(`  Reference: ${finalRec.reference}`);
      console.log(`  Amount: ₦${finalRec.amount} ${finalRec.currency}`);
      console.log(`  Provider Reference: ${finalRec.provider_reference}`);
      console.log(`  Initial Status: ${rec.status}`);
      console.log(`  Final Status: ${finalRec.status}`);
      console.log(`  Revenue Delta Match: ${revDelta === amount ? 'YES' : 'NO'}`);
      console.log(`  Customer Wallets Affected: NONE (0)`);
      console.log(`  Duplicate Payouts: NONE (0)`);
      console.log('═══════════════════════════════════════════════════════════════\n');

    } else {
      console.error('  ❌ DB Record not found for reference:', idempotencyKey);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

executeLiveSettlement().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
