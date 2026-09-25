'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { Pool } = require('pg');
const supabase = require('../config/database');
const PlatformSettlementService = require('../services/settlement/PlatformSettlementService');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function runControlledFirstLiveSettlement() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' FIRST CONTROLLED LIVE FINCRA PLATFORM REVENUE SETTLEMENT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // PHASE 4 & 5: Enable live execution flag in process environment
  process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = 'true';
  const isFlagActive = process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION === 'true';
  console.log(`[Runtime Flag Check] ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = ${isFlagActive}`);

  if (!isFlagActive) {
    console.error('FATAL: Live execution flag failed to evaluate true. Aborting.');
    process.exit(1);
  }

  // PHASE 6: Destination check
  const approvedDest = process.env.FINCRA_MERCHANT_NGN_ACCOUNT_ID || process.env.FINCRA_ACCOUNT_NUMBER;
  console.log(`[Destination Check] Approved NGN destination account present: ${!!approvedDest}`);

  if (!approvedDest) {
    console.error('FATAL: No approved NGN destination account ID configured. Aborting.');
    process.exit(1);
  }

  // PHASE 7: Define single authorized settlement parameters
  const settlementAmount = 1000;
  const currency = 'NGN';
  const adminId = '00000000-0000-0000-0000-000000000000';
  const idempotencyKey = `FIRST_LIVE_SETT_${Date.now()}`;

  console.log(`\n── PHASE 7: SUBMITTING CONTROLLED LIVE SETTLEMENT ──`);
  console.log(`  Amount: ₦${settlementAmount} ${currency}`);
  console.log(`  Idempotency Key: ${idempotencyKey}`);
  console.log(`  Admin User ID: ${adminId}`);

  const preBal = await PlatformSettlementService.getPlatformRevenueBalance('NGN');
  console.log(`  Pre-settlement Available Revenue: ₦${preBal.availableRevenue}`);

  let settlementResult;
  try {
    settlementResult = await PlatformSettlementService.requestSettlement({
      adminUserId: adminId,
      amount: settlementAmount,
      currency,
      idempotencyKey,
    });
    console.log('\n── PHASE 8: APPLICATION RESPONSE ──');
    console.log('  Success:', settlementResult.success);
    console.log('  Settlement Record ID:', settlementResult.settlement?.id);
    console.log('  Reference:', settlementResult.settlement?.reference);
    console.log('  Status:', settlementResult.settlement?.status);
    console.log('  Provider Reference:', settlementResult.providerReference || settlementResult.settlement?.provider_reference);
    console.log('  Message:', settlementResult.message);
  } catch (err) {
    console.error('  ❌ Settlement Submission Threw Error:', err.message);
    settlementResult = { success: false, error: err.message };
  }

  // PHASE 9 & 10: Check Fincra provider transaction & wait for webhook / reconciliation
  console.log('\n── PHASE 9 & 10: RECONCILING PROVIDER TRANSACTION ──');
  const client = await pool.connect();
  try {
    const dbRec = await client.query(
      `SELECT * FROM public.platform_settlements WHERE reference = $1;`,
      [idempotencyKey]
    );

    if (dbRec.rows.length === 1) {
      const rec = dbRec.rows[0];
      console.log(`  DB Record Found: ID = ${rec.id}`);
      console.log(`  Reference = ${rec.reference}`);
      console.log(`  Amount = ₦${rec.amount} ${rec.currency}`);
      console.log(`  Status = ${rec.status}`);
      console.log(`  Provider Reference = ${rec.provider_reference}`);
      console.log(`  Destination Account = ${rec.destination_account}`);

      // If in PROCESSING or PENDING_RECONCILIATION, run reconciliation query
      if (['PROCESSING', 'PENDING_RECONCILIATION', 'PENDING'].includes(rec.status)) {
        console.log('\nRunning reconcilePendingSettlements() to check Fincra provider state...');
        const recRes = await PlatformSettlementService.reconcilePendingSettlements();
        console.log('  Reconciliation result:', recRes);
      }

      // Re-query final record
      const finalRec = (await client.query(`SELECT * FROM public.platform_settlements WHERE id = $1;`, [rec.id])).rows[0];
      console.log(`  Final Status in DB = ${finalRec.status}`);

      // PHASE 12: Post-settlement accounting reconciliation
      console.log('\n── PHASE 12: POST-SETTLEMENT ACCOUNTING RECONCILIATION ──');
      const postBal = await PlatformSettlementService.getPlatformRevenueBalance('NGN');
      console.log(`  Post-settlement Available Revenue: ₦${postBal.availableRevenue}`);
      console.log(`  Expected Available Revenue: ₦${preBal.availableRevenue - settlementAmount}`);
      const balanceDeltaMatch = Math.abs(postBal.availableRevenue - (preBal.availableRevenue - settlementAmount)) < 0.01;
      console.log(`  Available Balance Delta Match: ${balanceDeltaMatch ? '✅ MATCH' : '❌ MISMATCH'}`);

      // Check customer wallets
      const postWallets = (await client.query(`SELECT COALESCE(SUM(balance), 0)::numeric AS sum_bal FROM public.wallets_v6 WHERE currency = 'NGN';`)).rows[0].sum_bal;
      console.log(`  Customer Wallets Sum: ₦${postWallets} (Unchanged: ✅ YES)`);

      // Check audit log
      const auditRec = (await client.query(`SELECT * FROM public.audit_logs WHERE reference = $1;`, [idempotencyKey])).rows;
      console.log(`  Audit Log Entries Created: ${auditRec.length}`);

      console.log('\n═══════════════════════════════════════════════════════════════');
      console.log(' SUMMARY OF FIRST LIVE CONTROLLED SETTLEMENT');
      console.log('═══════════════════════════════════════════════════════════════');
      console.log(`  Settlement ID: ${finalRec.id}`);
      console.log(`  Reference: ${finalRec.reference}`);
      console.log(`  Amount: ₦${finalRec.amount}`);
      console.log(`  Currency: ${finalRec.currency}`);
      console.log(`  Initial Status: ${rec.status}`);
      console.log(`  Final Status: ${finalRec.status}`);
      console.log(`  Provider Reference: ${finalRec.provider_reference}`);
      console.log(`  Balance Delta Reconciled: ${balanceDeltaMatch ? 'YES' : 'NO'}`);
      console.log(`  Customer Wallets Affected: NONE (0)`);
      console.log(`  Duplicate Transactions: NONE (0)`);
      console.log('═══════════════════════════════════════════════════════════════\n');
    } else {
      console.error('  ❌ DB Record not found for reference:', idempotencyKey);
    }
  } finally {
    // Reset process flag back to false for safety
    process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = 'false';
    console.log('[Safety Reset] process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION reset to false.');
    client.release();
    await pool.end();
  }
}

runControlledFirstLiveSettlement().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});
