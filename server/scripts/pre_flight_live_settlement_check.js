'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const axios = require('axios');
const https = require('https');
const { Pool } = require('pg');
const PlatformSettlementService = require('../services/settlement/PlatformSettlementService');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const agent = new https.Agent({ family: 4, timeout: 10000 });

async function preflight() {
  console.log('── STEP 1: PRE-FLIGHT READ-ONLY VERIFICATION ──\n');

  let passed = true;

  // 1. Clock Check (Render vs Gateway)
  let gwMs = null, renderMs = null;
  try {
    const gwRes = await axios.get('https://gateway.notestandard.com/health', { httpsAgent: agent });
    gwMs = new Date(gwRes.headers['date']).getTime();
    const renderRes = await axios.get('https://note-standard-api.onrender.com/api/provider-health', { httpsAgent: agent });
    renderMs = new Date(renderRes.headers['date']).getTime();
    const deltaSec = Math.abs(Math.round((renderMs - gwMs) / 1000));
    console.log(`[Clock Check] Render Time: ${new Date(renderMs).toISOString()}, Gateway Time: ${new Date(gwMs).toISOString()}`);
    console.log(`[Clock Check] Delta = ${deltaSec}s (Allowed: <= 300s) — ${deltaSec <= 300 ? '✅ PASS' : '❌ FAIL'}`);
    if (deltaSec > 300) passed = false;
  } catch (err) {
    console.error(`[Clock Check Error] ${err.message}`);
    passed = false;
  }

  // 2. Server Destination Check
  const ngnDest = process.env.FINCRA_MERCHANT_NGN_ACCOUNT_ID || process.env.FINCRA_ACCOUNT_NUMBER || process.env.FINCRA_MERCHANT_SETTLEMENT_ACCOUNT_ID;
  console.log(`\n[Destination Check] Resolved Server NGN Destination Account: "${ngnDest}"`);
  if (ngnDest === '5000701121' || ngnDest.length > 5) {
    console.log('  ✅ PASS: Server destination account present and valid');
  } else {
    console.error('  ❌ FAIL: Invalid or missing destination account');
    passed = false;
  }

  // 3. Database Check (Unresolved settlements, available balance, baseline metrics)
  const client = await pool.connect();
  try {
    const unresolvedRes = await client.query(
      `SELECT COUNT(*)::int AS count FROM public.platform_settlements
       WHERE currency = 'NGN' AND status IN ('PENDING', 'PROCESSING', 'PENDING_RECONCILIATION');`
    );
    const unresolvedCount = unresolvedRes.rows[0].count;
    console.log(`\n[Unresolved Settlements Check] Count in PENDING/PROCESSING/PENDING_RECONCILIATION: ${unresolvedCount}`);
    if (unresolvedCount === 0) {
      console.log('  ✅ PASS: Zero unresolved settlements');
    } else {
      console.error(`  ❌ FAIL: ${unresolvedCount} unresolved settlements exist! Must resolve before live payout.`);
      passed = false;
    }

    const bal = await PlatformSettlementService.getPlatformRevenueBalance('NGN');
    console.log(`\n[Available Revenue Check] NGN Available Revenue = ₦${bal.availableRevenue}`);
    if (bal.availableRevenue >= 1000) {
      console.log('  ✅ PASS: Available revenue >= ₦1,000.00');
    } else {
      console.error('  ❌ FAIL: Insufficient available platform revenue');
      passed = false;
    }

    const walletsRes = await client.query(
      `SELECT COALESCE(SUM(balance), 0)::numeric AS sum_bal FROM public.wallets_v6 WHERE currency = 'NGN';`
    );
    console.log(`[Baseline Metric] Customer Wallets Aggregate: ₦${walletsRes.rows[0].sum_bal}`);

    const revRes = await client.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS sum_rev FROM public.revenue_logs WHERE currency = 'NGN';`
    );
    console.log(`[Baseline Metric] Revenue Logs Total: ₦${revRes.rows[0].sum_rev}`);

  } finally {
    client.release();
    await pool.end();
  }

  console.log(`\n── PRE-FLIGHT VERIFICATION VERDICT: ${passed ? '✅ ALL CHECKS PASSED — READY FOR ACTIVATION' : '❌ CHECKS FAILED — STOP'} ──\n`);
  if (!passed) process.exit(1);
}

preflight().catch(err => { console.error('Preflight error:', err); process.exit(1); });
