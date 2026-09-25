const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Base Rates
const ADMIN_BASE_RATE = 0.045;   // 4.5% Platform Revenue
const PARTNER_BASE_RATE = 0.001; // 0.1% Partner Commission
const REFERRER_BASE_RATE = 0.001;// 0.1% Referrer Commission

async function runFinalWaterfallDryRun() {
  console.log('================================================================================');
  console.log(' 🔍 FINAL AUTHORITATIVE FEE WATERFALL DRY-RUN REPORT (ZERO MUTATION)');
  console.log('================================================================================\n');

  // Fetch all transactions
  const { data: txs, error: txErr } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (txErr) {
    console.error('Failed to fetch transactions:', txErr);
    return;
  }

  // Fetch profiles for referrer_id and plan
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, referrer_id, plan_tier, subscription_plan');
  
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  // Fetch existing revenue_logs
  const { data: existingLogs } = await supabase.from('revenue_logs').select('source_transaction_id');
  const loggedTxIds = new Set((existingLogs || []).map(l => l.source_transaction_id).filter(Boolean));

  const eligibleRows = [];
  const totalsByCurrency = {};

  const feeBearingTypes = ['DEPOSIT', 'WITHDRAWAL', 'SWAP', 'PAYMENT', 'PAYIN', 'PAYOUT', 'TRANSFER', 'WALLET_TOPUP'];

  for (const t of txs) {
    const status = (t.status || '').toUpperCase();
    const type = (t.type || '').toUpperCase();
    const cur = (t.currency || 'NGN').toUpperCase();
    const gross = parseFloat(t.amount || 0);

    // Filter checks
    if (!['COMPLETED', 'SUCCESS'].includes(status)) continue;
    if (!feeBearingTypes.includes(type)) continue;
    if (loggedTxIds.has(t.id)) continue;
    if (gross <= 0) continue;
    if ((t.reference_id || '').includes('TEST_MOCK_') || (t.metadata?.is_test === true)) continue;

    // Resolve user profile for plan discount & referrer
    const userProfile = profileMap.get(t.user_id) || {};
    const plan = (userProfile.plan_tier || userProfile.subscription_plan || 'FREE').toUpperCase();
    const hasReferrer = !!userProfile.referrer_id;

    // Apply Plan Discount
    let discountMultiplier = 1.0;
    if (plan === 'PRO') discountMultiplier = 0.8;      // 20% fee discount
    if (plan === 'BUSINESS') discountMultiplier = 0.5; // 50% fee discount

    // Effective Component Rates
    const adminRate = ADMIN_BASE_RATE * discountMultiplier;
    const partnerRate = PARTNER_BASE_RATE * discountMultiplier;
    const referrerRate = hasReferrer ? (REFERRER_BASE_RATE * discountMultiplier) : 0;
    const totalRate = adminRate + partnerRate + referrerRate;

    // Component Amounts
    const platformRevenue = Math.round(gross * adminRate * 100) / 100;
    const partnerCommission = Math.round(gross * partnerRate * 100) / 100;
    const referrerCommission = Math.round(gross * referrerRate * 100) / 100;
    const customerFee = Math.round(gross * totalRate * 100) / 100;
    const providerFee = t.metadata?.provider_fee ? parseFloat(t.metadata.provider_fee) : 0;
    const discountAmount = Math.round(gross * ((ADMIN_BASE_RATE + PARTNER_BASE_RATE + (hasReferrer ? REFERRER_BASE_RATE : 0)) - totalRate) * 100) / 100;

    const row = {
      id: t.id,
      ref: t.reference_id || t.provider_reference || t.id,
      type,
      currency: cur,
      gross,
      customerFee,
      platformRevenue,
      partnerCommission,
      referrerCommission,
      providerFee,
      plan,
      discountAmount,
      hasReferrer,
      created_at: t.created_at
    };

    eligibleRows.push(row);

    if (!totalsByCurrency[cur]) {
      totalsByCurrency[cur] = {
        count: 0,
        grossVolume: 0,
        customerFees: 0,
        platformRevenue: 0,
        partnerCommissions: 0,
        referrerCommissions: 0,
        providerFees: 0,
        discountsApplied: 0
      };
    }

    totalsByCurrency[cur].count += 1;
    totalsByCurrency[cur].grossVolume += gross;
    totalsByCurrency[cur].customerFees += customerFee;
    totalsByCurrency[cur].platformRevenue += platformRevenue;
    totalsByCurrency[cur].partnerCommissions += partnerCommission;
    totalsByCurrency[cur].referrerCommissions += referrerCommission;
    totalsByCurrency[cur].providerFees += providerFee;
    totalsByCurrency[cur].discountsApplied += discountAmount;
  }

  console.log(`TOTAL ELIGIBLE TRANSACTIONS: ${eligibleRows.length}\n`);

  console.log('=== DETAILED WATERFALL RECONCILIATION BY CURRENCY ===\n');

  for (const [currency, stats] of Object.entries(totalsByCurrency)) {
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`CURRENCY: ${currency}`);
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`  Eligible Transaction Count : ${stats.count}`);
    console.log(`  Total Gross Volume         : ${currency} ${stats.grossVolume.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`  TOTAL CUSTOMER FEES        : ${currency} ${stats.customerFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`  ├─ TOTAL PLATFORM REVENUE  : ${currency} ${stats.platformRevenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (NoteStandard Admin)`);
    console.log(`  ├─ TOTAL PARTNER COMMISSIONS: ${currency} ${stats.partnerCommissions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`  └─ TOTAL REFERRER COMMISSIONS: ${currency} ${stats.referrerCommissions.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`  TOTAL PROVIDER FEES        : ${currency} ${stats.providerFees.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`  TOTAL DISCOUNTS APPLIED    : ${currency} ${stats.discountsApplied.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    
    // Mathematical Verification
    const sumComponents = stats.platformRevenue + stats.partnerCommissions + stats.referrerCommissions;
    const diff = Math.abs(stats.customerFees - sumComponents);
    console.log(`  MATHEMATICAL RECONCILIATION: Customer Fees (${stats.customerFees.toFixed(2)}) = Revenue (${stats.platformRevenue.toFixed(2)}) + Partner (${stats.partnerCommissions.toFixed(2)}) + Referrer (${stats.referrerCommissions.toFixed(2)})`);
    console.log(`  RECONCILIATION MATCH       : ${diff < 0.05 ? '✅ 100% PERFECT MATCH' : '❌ MISMATCH'}\n`);
  }

  console.log('=== SAMPLE WATERFALL ROWS (LAST 10 TRANSACTIONS) ===\n');
  eligibleRows.slice(0, 10).forEach((r, i) => {
    console.log(`${i+1}. [${r.created_at}] Ref:${r.ref.slice(0, 18)} | ${r.currency} ${r.gross} | CustFee:${r.customerFee} = PlatRev:${r.platformRevenue} + Partner:${r.partnerCommission} + Ref:${r.referrerCommission} (Plan:${r.plan})`);
  });
}

runFinalWaterfallDryRun().catch(console.error);
