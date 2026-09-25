const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const supabaseUrl = process.env.SUPABASE_URL || 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const ADMIN_BASE_RATE = 0.045;   // 4.5% Admin Platform Revenue
const PARTNER_BASE_RATE = 0.001; // 0.1% Partner Commission
const REFERRER_BASE_RATE = 0.001;// 0.1% Referrer Commission

const SYSTEM_USER_ID = '00000000-0000-0000-0000-000000000000';

async function executeReconciliationAndInit() {
  console.log('================================================================================');
  console.log(' 🚀 EXECUTING IDEMPOTENT HISTORICAL RECONCILIATION & PLATFORM WALLET INIT');
  console.log('================================================================================\n');

  // 1. Initialize Platform Wallets for operational currencies (NGN, USD, GHS)
  console.log('STEP 1: Initializing Platform Wallets (NGN, USD, GHS)...');
  const currencies = ['NGN', 'USD', 'GHS'];

  for (const cur of currencies) {
    // Check if platform_wallets row exists
    const { data: existingPw } = await supabase
      .from('platform_wallets')
      .select('*')
      .eq('currency', cur)
      .maybeSingle();

    if (!existingPw) {
      // Ensure system wallet exists in wallets_store
      let { data: sysWallet } = await supabase
        .from('wallets_store')
        .select('id, balance, available_balance')
        .eq('user_id', SYSTEM_USER_ID)
        .eq('currency', cur)
        .maybeSingle();

      if (!sysWallet) {
        console.log(`Creating system wallet in wallets_store for ${cur}...`);
        const { data: newW, error: wErr } = await supabase
          .from('wallets_store')
          .insert({
            user_id: SYSTEM_USER_ID,
            currency: cur,
            balance: 0,
            available_balance: 0,
            pending_balance: 0,
            network: 'native',
            provider: 'internal',
            address: `PLATFORM_REVENUE_${cur}`
          })
          .select('id, balance, available_balance')
          .single();
        if (wErr) console.error(`Error creating system wallet for ${cur}:`, wErr.message);
        sysWallet = newW;
      }

      console.log(`Inserting platform_wallets record for ${cur}...`);
      const { error: pwErr } = await supabase.from('platform_wallets').insert({
        currency: cur,
        chain: 'NATIVE',
        description: `NoteStandard Platform Fee Wallet (${cur})`,
        wallet_id: sysWallet?.id || null,
        external_address: `PLATFORM_REVENUE_${cur}`
      });
      if (pwErr) console.error(`Error inserting platform_wallet for ${cur}:`, pwErr.message);
      else console.log(`✅ Platform Wallet initialized for ${cur}`);
    } else {
      console.log(`✓ Platform Wallet already exists for ${cur}`);
    }
  }

  // 2. Fetch profiles for referrers & plans
  const { data: profiles } = await supabase.from('profiles').select('id, referrer_id, plan_tier, subscription_plan');
  const profileMap = new Map((profiles || []).map(p => [p.id, p]));

  // 3. Fetch existing revenue_logs to prevent double insertion
  const { data: existingLogs } = await supabase.from('revenue_logs').select('source_transaction_id');
  const loggedTxIds = new Set((existingLogs || []).map(l => l.source_transaction_id).filter(Boolean));

  // 4. Fetch transactions
  const { data: txs, error: txErr } = await supabase.from('transactions').select('*').order('created_at', { ascending: false });
  if (txErr) {
    console.error('Error fetching transactions:', txErr);
    return;
  }

  const feeBearingTypes = ['DEPOSIT', 'WITHDRAWAL', 'SWAP', 'PAYMENT', 'PAYIN', 'PAYOUT', 'TRANSFER', 'WALLET_TOPUP'];
  let processedCount = 0;
  let skippedCount = 0;

  const totalsByCurrency = { NGN: 0, USD: 0, GHS: 0 };

  console.log('\nSTEP 2: Processing Eligible Transactions for Backfill...');

  for (const t of txs) {
    const status = (t.status || '').toUpperCase();
    const type = (t.type || '').toUpperCase();
    const cur = (t.currency || 'NGN').toUpperCase();
    const gross = parseFloat(t.amount || 0);

    // Skip non-eligible
    if (!['COMPLETED', 'SUCCESS'].includes(status) || !feeBearingTypes.includes(type) || loggedTxIds.has(t.id) || gross <= 0) {
      skippedCount++;
      continue;
    }
    if ((t.reference_id || '').includes('TEST_MOCK_') || (t.metadata?.is_test === true)) {
      skippedCount++;
      continue;
    }

    // Calculate rates and components
    const userProfile = profileMap.get(t.user_id) || {};
    const plan = (userProfile.plan_tier || userProfile.subscription_plan || 'FREE').toUpperCase();
    const hasReferrer = !!userProfile.referrer_id;

    let discountMultiplier = 1.0;
    if (plan === 'PRO') discountMultiplier = 0.8;
    if (plan === 'BUSINESS') discountMultiplier = 0.5;

    const adminRate = ADMIN_BASE_RATE * discountMultiplier;
    const partnerRate = PARTNER_BASE_RATE * discountMultiplier;
    const referrerRate = hasReferrer ? (REFERRER_BASE_RATE * discountMultiplier) : 0;
    const totalRate = adminRate + partnerRate + referrerRate;

    const customerFee = Math.round(gross * totalRate * 100) / 100;
    const platformRevenue = Math.round(gross * adminRate * 100) / 100;
    const partnerCommission = Math.round(gross * partnerRate * 100) / 100;
    const referrerCommission = Math.round(gross * referrerRate * 100) / 100;

    // A. Update transactions.fee
    const { error: txUpdErr } = await supabase
      .from('transactions')
      .update({ fee: customerFee })
      .eq('id', t.id);

    if (txUpdErr) {
      console.error(`Failed to update fee for tx ${t.id}:`, txUpdErr.message);
      continue;
    }

    // B. Insert into revenue_logs (Platform Revenue Component ONLY)
    const revenueType = type === 'DEPOSIT' || type === 'PAYIN' ? 'deposit_fee' :
                        type === 'WITHDRAWAL' || type === 'PAYOUT' ? 'withdrawal_fee' :
                        type === 'SWAP' ? 'swap_fee' :
                        type === 'TRANSFER' ? 'transfer_fee' : 'other_fee';

    const { error: revInsErr } = await supabase
      .from('revenue_logs')
      .insert({
        source_transaction_id: t.id,
        user_id: t.user_id,
        amount: platformRevenue,
        currency: cur,
        revenue_type: revenueType,
        metadata: {
          tx_type: type,
          customer_total_fee: customerFee,
          admin_revenue: platformRevenue,
          partner_commission: partnerCommission,
          referrer_commission: referrerCommission,
          reconciled_at: new Date().toISOString()
        }
      });

    if (revInsErr && !revInsErr.message.includes('unique constraint')) {
      console.error(`Failed to insert revenue_log for tx ${t.id}:`, revInsErr.message);
    } else {
      processedCount++;
      if (totalsByCurrency[cur] !== undefined) totalsByCurrency[cur] += platformRevenue;
    }
  }

  console.log(`\nReconciliation Complete: ${processedCount} transactions processed, ${skippedCount} skipped.`);

  // STEP 3: Update system wallet balances in wallets_store for platform_wallets
  console.log('\nSTEP 3: Updating Platform Wallet balances from revenue logs sum...');

  for (const cur of currencies) {
    // Calculate total revenue from revenue_logs for this currency
    const { data: revSums } = await supabase
      .from('revenue_logs')
      .select('amount')
      .eq('currency', cur);

    const totalRev = (revSums || []).reduce((acc, r) => acc + parseFloat(r.amount || 0), 0);

    // Update wallets_store system wallet
    await supabase
      .from('wallets_store')
      .update({
        balance: totalRev,
        available_balance: totalRev,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', SYSTEM_USER_ID)
      .eq('currency', cur);

    console.log(`✅ Platform Revenue Wallet for ${cur} updated: Balance = ${cur} ${totalRev.toLocaleString(undefined, { minimumFractionDigits: 2 })}`);
  }

  console.log('\n================================================================================');
  console.log(' 🎉 RECONCILIATION & PLATFORM ACCOUNT INITIALIZATION COMPLETED SUCCESSFULLY');
  console.log('================================================================================');
}

executeReconciliationAndInit().catch(console.error);
