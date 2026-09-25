'use strict';

/**
 * execute_controlled_live_settlement.js
 * ══════════════════════════════════════════════════════════════════════════════
 * AUTHORIZED SINGLE LIVE FINCRA PLATFORM REVENUE SETTLEMENT EXECUTION
 *
 * Performs exactly ONE live settlement attempt of ₦1,000 NGN using:
 *   - Atomic revenue reservation (RPC)
 *   - Server-resolved destination (5000701121)
 *   - Live Fincra gateway dispatcher (HMAC signed)
 *   - Fresh idempotency key
 *   - Clock-sync for HMAC timestamp tolerance
 *   - Post-flight safety flag reset
 */

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const axios = require('axios');
const supabase = require('../config/database');

async function executeControlledLiveSettlement() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' CONTROLLED LIVE FINCRA PLATFORM REVENUE SETTLEMENT EXECUTION');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // ── STEP 0: Clock Sync (Enforce Gateway <300s Timestamp Alignment) ───────
  try {
    const gwProbe = await axios.get('https://gateway.notestandard.com/proxy', { timeout: 5000 }).catch(e => e.response);
    const gwHeaderDate = gwProbe?.headers?.['date'];
    if (gwHeaderDate) {
      const gwServerTime = new Date(gwHeaderDate).getTime();
      const localTime = Date.now();
      const clockDelta = gwServerTime - localTime;
      console.log(`[CLOCK SYNC] Gateway Server Time: ${new Date(gwServerTime).toISOString()}`);
      console.log(`[CLOCK SYNC] Local Machine Time:   ${new Date(localTime).toISOString()}`);
      console.log(`[CLOCK SYNC] Calculated Clock Delta: ${clockDelta}ms`);

      if (Math.abs(clockDelta) > 5000) {
        console.log(`[CLOCK SYNC] Syncing process Date.now() with Gateway server clock (offset: +${clockDelta}ms)...`);
        const originalDateNow = Date.now;
        Date.now = function () {
          return originalDateNow() + clockDelta;
        };
      }
    }
  } catch (cErr) {
    console.warn(`[CLOCK SYNC] Warning: Failed to probe gateway date: ${cErr.message}`);
  }

  const PlatformSettlementService = require('../services/settlement/PlatformSettlementService');

  // Generate fresh unique idempotency key
  const randSuffix = Math.random().toString(36).substring(2, 6).toUpperCase();
  const idempotencyKey = `CONTROLLED_LIVE_NGN_20260924_${randSuffix}`;
  const amount = 1000.00;
  const currency = 'NGN';
  const adminUserId = '00000000-0000-0000-0000-000000000000';

  console.log(`\n[EXECUTION PARAMETERS]`);
  console.log(`  Idempotency Key: ${idempotencyKey}`);
  console.log(`  Amount: ₦${amount.toLocaleString('en-US', { minimumFractionDigits: 2 })} ${currency}`);
  console.log(`  Purpose: NoteStandard Platform Revenue Settlement`);

  // ── STEP 1: Pre-flight Checks & Baseline Capture ───────────────────────────
  console.log('\n── Step 1: Pre-Flight Baseline Capture ─────────────────────────');
  
  // Check available platform revenue
  const preRev = await PlatformSettlementService.getPlatformRevenueBalance('NGN');
  console.log(`  Available NGN Platform Revenue BEFORE: ₦${preRev.availableRevenue.toFixed(2)}`);

  if (preRev.availableRevenue < amount) {
    console.error(`  ❌ STOP: Available revenue (₦${preRev.availableRevenue}) is below ₦${amount}`);
    process.exit(1);
  }

  // Check customer wallet aggregate
  const { data: walletsBefore } = await supabase.from('wallets_v6').select('balance').eq('currency', 'NGN');
  const custWalletBefore = walletsBefore ? walletsBefore.reduce((acc, w) => acc + parseFloat(w.balance || 0), 0) : 0;
  console.log(`  Customer NGN Wallet Aggregate BEFORE: ₦${custWalletBefore.toFixed(2)}`);

  // Check partner commission table count
  const { data: commsBefore } = await supabase.from('commissions').select('id');
  const commsCountBefore = commsBefore ? commsBefore.length : 0;
  console.log(`  Partner Commissions Record Count BEFORE: ${commsCountBefore}`);

  // Confirm previous failed settlement remains unchanged
  const { data: failedPrev } = await supabase
    .from('platform_settlements')
    .select('id, status, provider_reference')
    .eq('id', 'b7e5e630-fa49-4b3a-93e8-4c34752f7034')
    .single();

  console.log(`  Previous Failed Settlement Status: ${failedPrev?.status} (provider_ref: ${failedPrev?.provider_reference})`);

  if (failedPrev?.status !== 'FAILED') {
    console.error('  ❌ STOP: Previous failed settlement status was altered!');
    process.exit(1);
  }

  // ── STEP 2: Enable Live Execution Flag ONLY for this execution ─────────────
  console.log('\n── Step 2: Activating Live Execution Flag ─────────────────────');
  process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = 'true';
  console.log(`  ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = ${process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION}`);

  let settlementResult = null;
  let executionError = null;

  // ── STEP 3: Submit Exactly ONE Settlement ─────────────────────────────────
  console.log('\n── Step 3: Executing Live Settlement ───────────────────────────');

  try {
    settlementResult = await PlatformSettlementService.requestSettlement({
      adminUserId,
      amount,
      currency,
      idempotencyKey,
    });
    console.log('  Settlement Service Response:', JSON.stringify(settlementResult, null, 2));
  } catch (err) {
    executionError = err;
    console.error('  ❌ Settlement Request Exception:', err.message);
  } finally {
    // ── STEP 4: Immediately Reset Live Execution Flag ────────────────────────
    process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = 'false';
    console.log('\n── Step 4: Live Execution Flag Reset ──────────────────────────');
    console.log(`  ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION = ${process.env.ENABLE_LIVE_SETTLEMENT_PROVIDER_EXECUTION}`);
  }

  // ── STEP 5: Post-Flight Inspection & Accounting Verification ────────────────
  console.log('\n── Step 5: Post-Flight Verification & Accounting Reconciliation ─');

  // Query created settlement record from database
  const { data: dbSettlement } = await supabase
    .from('platform_settlements')
    .select('*')
    .eq('reference', idempotencyKey)
    .maybeSingle();

  console.log('  Database Settlement Record:', JSON.stringify(dbSettlement, null, 2));

  // Query available platform revenue AFTER
  const postRev = await PlatformSettlementService.getPlatformRevenueBalance('NGN');
  console.log(`  Available NGN Platform Revenue AFTER: ₦${postRev.availableRevenue.toFixed(2)} (Delta: ₦${(postRev.availableRevenue - preRev.availableRevenue).toFixed(2)})`);

  // Query customer wallet aggregate AFTER
  const { data: walletsAfter } = await supabase.from('wallets_v6').select('balance').eq('currency', 'NGN');
  const custWalletAfter = walletsAfter ? walletsAfter.reduce((acc, w) => acc + parseFloat(w.balance || 0), 0) : 0;
  console.log(`  Customer NGN Wallet Aggregate AFTER: ₦${custWalletAfter.toFixed(2)} (Delta: ₦${(custWalletAfter - custWalletBefore).toFixed(2)})`);

  // Query partner commission table count AFTER
  const { data: commsAfter } = await supabase.from('commissions').select('id');
  const commsCountAfter = commsAfter ? commsAfter.length : 0;
  console.log(`  Partner Commissions Record Count AFTER: ${commsCountAfter}`);

  // Query duplicate count
  const { data: allMatching } = await supabase.from('platform_settlements').select('id').eq('reference', idempotencyKey);
  console.log(`  Matching Settlement Record Count: ${allMatching?.length || 0}`);

  // ── STEP 6: Final Outcome Classification ──────────────────────────────────
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log(' CONTROLLED LIVE SETTLEMENT EXECUTION RESULT SUMMARY');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const providerRef = dbSettlement?.provider_reference || dbSettlement?.fincra_reference || null;

  console.log(`Reference:               ${idempotencyKey}`);
  console.log(`Settlement ID:           ${dbSettlement?.id || 'N/A'}`);
  console.log(`Status:                  ${dbSettlement?.status || 'FAILED'}`);
  console.log(`Provider Reference:      ${providerRef || 'NONE'}`);
  console.log(`Failure Reason:          ${dbSettlement?.failure_reason || 'N/A'}`);

  let classification = '';
  if (dbSettlement?.status === 'COMPLETED' || dbSettlement?.status === 'PROCESSING') {
    if (providerRef) {
      classification = 'LIVE TEST SUCCESSFUL — PROVIDER ACCEPTED';
    } else {
      classification = 'LIVE TEST AMBIGUOUS — RECONCILIATION REQUIRED';
    }
  } else if (dbSettlement?.status === 'PENDING_RECONCILIATION') {
    classification = 'LIVE TEST AMBIGUOUS — RECONCILIATION REQUIRED';
  } else {
    classification = 'LIVE TEST FAILED — SAFE ROLLBACK';
  }

  console.log(`\nFINAL CLASSIFICATION: ${classification}\n`);
  process.exit(0);
}

executeControlledLiveSettlement();
