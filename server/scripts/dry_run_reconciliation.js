const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Rates: Admin 4.5% (0.045), Partner 0.1% (0.001), Referrer 0.1% (0.001) -> Total 4.7% (0.047)
// If no referrer: Admin 4.5% + Partner 0.1% = 4.6% (0.046)
const ADMIN_RATE = 0.045;
const PARTNER_RATE = 0.001;
const REFERRER_RATE = 0.001;

async function dryRunReconciliation() {
  console.log('=================================================================');
  console.log(' 🔍 DRY-RUN HISTORICAL FEE RECONCILIATION REPORT (ZERO DB MUTATION)');
  console.log('=================================================================\n');

  // Fetch all transactions
  const { data: txs, error } = await supabase
    .from('transactions')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch transactions:', error);
    return;
  }

  // Fetch all existing revenue_logs to avoid double counting
  const { data: existingLogs } = await supabase.from('revenue_logs').select('source_transaction_id');
  const loggedTxIds = new Set((existingLogs || []).map(l => l.source_transaction_id).filter(Boolean));

  // Fetch profiles to check for referrers
  const { data: profiles } = await supabase.from('profiles').select('id, referrer_id');
  const referrerMap = new Map((profiles || []).map(p => [p.id, p.referrer_id]));

  const eligible = [];
  const excluded = [];
  const ambiguous = [];

  const totalsByCurrency = {}; // { NGN: { gross, platformRev, partnerFee, referrerFee, count }, USD: ... }

  for (const t of txs) {
    const status = (t.status || '').toUpperCase();
    const type = (t.type || '').toUpperCase();
    const cur = (t.currency || 'NGN').toUpperCase();
    const gross = parseFloat(t.amount || 0);
    const existingFee = parseFloat(t.fee || 0);

    // Filter 1: Completion Status
    if (!['COMPLETED', 'SUCCESS'].includes(status)) {
      excluded.push({
        id: t.id,
        ref: t.reference_id,
        type: t.type,
        cur,
        gross,
        reason: `Status is '${t.status}' (not COMPLETED/SUCCESS)`
      });
      continue;
    }

    // Filter 2: Fee-bearing Transaction Types
    const feeBearingTypes = ['DEPOSIT', 'WITHDRAWAL', 'SWAP', 'PAYMENT', 'PAYIN', 'PAYOUT', 'TRANSFER', 'WALLET_TOPUP'];
    if (!feeBearingTypes.includes(type)) {
      excluded.push({
        id: t.id,
        ref: t.reference_id,
        type: t.type,
        cur,
        gross,
        reason: `Transaction type '${t.type}' is not fee-bearing`
      });
      continue;
    }

    // Filter 3: Check if already logged in revenue_logs or has existing non-zero fee
    if (loggedTxIds.has(t.id)) {
      excluded.push({
        id: t.id,
        ref: t.reference_id,
        type: t.type,
        cur,
        gross,
        reason: 'Already recorded in revenue_logs'
      });
      continue;
    }

    // Filter 4: Internal / Zero Amount / Test Checks
    if (gross <= 0) {
      excluded.push({
        id: t.id,
        ref: t.reference_id,
        type: t.type,
        cur,
        gross,
        reason: 'Gross amount is zero or negative'
      });
      continue;
    }

    // Check for internal test accounts / mock references if any
    const isMock = (t.reference_id || '').includes('TEST_MOCK_') || (t.metadata?.is_test === true);
    if (isMock) {
      excluded.push({
        id: t.id,
        ref: t.reference_id,
        type: t.type,
        cur,
        gross,
        reason: 'Flagged as test/mock transaction'
      });
      continue;
    }

    // Determine referrer status
    const hasReferrer = !!referrerMap.get(t.user_id);
    const totalRate = hasReferrer ? (ADMIN_RATE + PARTNER_RATE + REFERRER_RATE) : (ADMIN_RATE + PARTNER_RATE);
    
    // Fee Calculations
    const calculatedCustomerFee = gross * totalRate;
    const calculatedPlatformRevenue = gross * ADMIN_RATE;
    const partnerFee = gross * PARTNER_RATE;
    const referrerFee = hasReferrer ? (gross * REFERRER_RATE) : 0;
    const providerFee = t.metadata?.provider_fee ? parseFloat(t.metadata.provider_fee) : 0;

    const row = {
      id: t.id,
      ref: t.reference_id || t.provider_reference || t.id,
      type,
      cur,
      gross,
      existingFee,
      calculatedCustomerFee,
      calculatedPlatformRevenue,
      partnerFee,
      referrerFee,
      providerFee,
      hasReferrer,
      created_at: t.created_at,
      provider: t.provider || 'internal'
    };

    eligible.push(row);

    if (!totalsByCurrency[cur]) {
      totalsByCurrency[cur] = { gross: 0, platformRev: 0, partnerFee: 0, referrerFee: 0, totalFee: 0, count: 0 };
    }
    totalsByCurrency[cur].gross += gross;
    totalsByCurrency[cur].platformRev += calculatedPlatformRevenue;
    totalsByCurrency[cur].partnerFee += partnerFee;
    totalsByCurrency[cur].referrerFee += referrerFee;
    totalsByCurrency[cur].totalFee += calculatedCustomerFee;
    totalsByCurrency[cur].count += 1;
  }

  console.log(`SUMMARY OF DRY-RUN RECONCILIATION:`);
  console.log(`- Total Transactions Analyzed: ${txs.length}`);
  console.log(`- Total Eligible for Backfill: ${eligible.length}`);
  console.log(`- Total Excluded: ${excluded.length}`);
  console.log(`- Total Ambiguous: ${ambiguous.length}\n`);

  console.log('--- RECOGNIZED REVENUE BY CURRENCY (PROJECTED) ---');
  for (const [c, stats] of Object.entries(totalsByCurrency)) {
    console.log(`Currency: ${c}`);
    console.log(`  Count: ${stats.count} completed transactions`);
    console.log(`  Total Gross Volume: ${c} ${stats.gross.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`  Projected Platform Revenue (4.5%): ${c} ${stats.platformRev.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`  Projected Partner Fee (0.1%): ${c} ${stats.partnerFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`  Projected Referrer Fee (0.1%): ${c} ${stats.referrerFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}`);
    console.log(`  Projected Total Customer Fees (4.6%-4.7%): ${c} ${stats.totalFee.toLocaleString('en-US', { minimumFractionDigits: 2 })}\n`);
  }

  console.log('--- SAMPLE ELIGIBLE TRANSACTIONS (TOP 10) ---');
  eligible.slice(0, 10).forEach((e, i) => {
    console.log(`${i+1}. [${e.created_at}] Ref:${e.ref} Type:${e.type} Gross:${e.gross} ${e.cur} -> CustomerFee:${e.calculatedCustomerFee.toFixed(2)} | PlatformRev:${e.calculatedPlatformRevenue.toFixed(2)} | Partner:${e.partnerFee.toFixed(2)}`);
  });

  console.log('\n--- SAMPLE EXCLUDED REASONS (TOP 10) ---');
  excluded.slice(0, 10).forEach((ex, i) => {
    console.log(`${i+1}. Ref:${ex.ref || ex.id} Type:${ex.type} Gross:${ex.gross} ${ex.cur} -> Reason: ${ex.reason}`);
  });
}

dryRunReconciliation().catch(console.error);
