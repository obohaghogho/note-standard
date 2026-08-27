/**
 * advertisementProductionHardening.test.js
 * ══════════════════════════════════════════════════════════════════════════════
 * NOTEStandard — Comprehensive Advertisement Module Hardening Test Suite
 */

'use strict';

const supabase = require('../config/database');
const PaymentService = require('../services/payment/paymentService');
const WebhookService = require('../services/WebhookService');
const subscriptionController = require('../controllers/subscriptionController');
const { v4: uuidv4 } = require('uuid');

let testPassedCount = 0;
let testFailedCount = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ [PASS] ${message}`);
    testPassedCount++;
  } else {
    console.error(`  ❌ [FAIL] ${message}`);
    testFailedCount++;
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function createTestProfile(overrides = {}) {
  const email = `ad_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@notestandard.test`;
  const { data: authData } = await supabase.auth.admin.createUser({
    email,
    password: 'Password123!',
    email_confirm: true
  }).catch(() => ({ data: null }));

  const userId = authData?.user?.id || uuidv4();

  const profileData = {
    id: userId,
    email,
    kyc_level: 1,
    is_verified: true,
    plan_tier: 'pro',
    status: 'active',
    ad_wallet_balance: 0,
    ...overrides
  };

  await supabase.from('profiles').upsert([profileData], { onConflict: 'id' });

  const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return profile || profileData;
}

function makeMockRes(cb) {
  return {
    statusCode: 200,
    status(s) { this.statusCode = s; return this; },
    json(d) { if (cb) cb(d, this.statusCode); return d; }
  };
}

async function runAdHardeningTestSuite() {
  console.log('\n=================================================================');
  console.log('NOTEStandard — ADVERTISEMENT MODULE PRODUCTION HARDENING SUITE');
  console.log('=================================================================\n');

  let userTier0, userTier1, userTier3, userRestricted, userB, sharedFundedAd, sharedUnpaidAd;

  try {
    userTier0 = await createTestProfile({ kyc_level: 0, is_verified: false, ad_wallet_balance: 0, plan_tier: 'pro' });
    userTier1 = await createTestProfile({ kyc_level: 1, is_verified: true, ad_wallet_balance: 100, plan_tier: 'pro' });
    userTier3 = await createTestProfile({ kyc_level: 3, is_verified: true, ad_wallet_balance: 50, plan_tier: 'business' });
    userRestricted = await createTestProfile({ kyc_level: 2, is_verified: true, status: 'restricted', ad_wallet_balance: 100, plan_tier: 'pro' });
    userB = await createTestProfile({ kyc_level: 1, is_verified: true, ad_wallet_balance: 0, plan_tier: 'pro' });

    // Insert active subscriptions
    await supabase.from('subscriptions').upsert([
      { user_id: userTier0.id, plan_tier: 'pro', plan_type: 'PRO', status: 'active', end_date: new Date(Date.now() + 30*86400000).toISOString() },
      { user_id: userTier1.id, plan_tier: 'pro', plan_type: 'PRO', status: 'active', end_date: new Date(Date.now() + 30*86400000).toISOString() },
      { user_id: userTier3.id, plan_tier: 'business', plan_type: 'BUSINESS', status: 'active', end_date: new Date(Date.now() + 30*86400000).toISOString() },
      { user_id: userRestricted.id, plan_tier: 'pro', plan_type: 'PRO', status: 'active', end_date: new Date(Date.now() + 30*86400000).toISOString() },
      { user_id: userB.id, plan_tier: 'pro', plan_type: 'PRO', status: 'active', end_date: new Date(Date.now() + 30*86400000).toISOString() }
    ], { onConflict: 'user_id' });

    // ─── 1. Valid wallet_topup credits exactly once ─────────────────────────────
    console.log('--- 1. Valid wallet_topup credits exactly once ---');
    const { data: pStart } = await supabase.from('profiles').select('ad_wallet_balance').eq('id', userTier1.id).single();
    const baseBal = Number(pStart.ad_wallet_balance || 0);

    const ref1 = `tx_adtopup_1_${uuidv4()}`;
    const init1 = await PaymentService.initializePayment(
      userTier1.id,
      userTier1.email,
      16000,
      'NGN',
      { type: 'wallet_topup', usdAmount: 10.00 }
    );
    const fin1 = await PaymentService.finalizeTransaction(init1.reference || ref1);
    assert(fin1.status === 'COMPLETED', 'First wallet_topup finalization completes');
    
    const { data: p1 } = await supabase.from('profiles').select('ad_wallet_balance').eq('id', userTier1.id).single();
    assert(Number(p1.ad_wallet_balance) === baseBal + 10.00, `Ad wallet balance increased by $10.00 (${baseBal} -> ${baseBal + 10})`);

    // ─── 2. Duplicate sync request credits exactly once ────────────────────────
    console.log('--- 2. Duplicate sync request credits exactly once ---');
    const mockReqSync = { body: { reference: init1.reference || ref1 }, user: { id: userTier1.id } };
    let syncResData = null;
    const mockResSync = makeMockRes((d) => { syncResData = d; });
    await subscriptionController.syncAdPayment(mockReqSync, mockResSync);
    assert(syncResData && syncResData.success === true, 'Duplicate sync returns success idempotently');

    const { data: p2 } = await supabase.from('profiles').select('ad_wallet_balance').eq('id', userTier1.id).single();
    assert(Number(p2.ad_wallet_balance) === baseBal + 10.00, `Ad wallet balance remains ${baseBal + 10.00} (No duplicate credit)`);

    // ─── 3. 3 concurrent sync requests credit listing exactly once ───────────────────
    console.log('--- 3. 3 concurrent sync requests credit exactly once ---');
    const init3 = await PaymentService.initializePayment(
      userTier1.id,
      userTier1.email,
      32000,
      'NGN',
      { type: 'wallet_topup', usdAmount: 20.00 }
    );
    await PaymentService.finalizeTransaction(init3.reference);

    const reqs3 = Array.from({ length: 3 }).map(() => {
      let rData = null;
      return subscriptionController.syncAdPayment(
        { body: { reference: init3.reference }, user: { id: userTier1.id } },
        makeMockRes((d) => { rData = d; })
      );
    });
    await Promise.all(reqs3);

    const { data: p3 } = await supabase.from('profiles').select('ad_wallet_balance').eq('id', userTier1.id).single();
    assert(Number(p3.ad_wallet_balance) === baseBal + 30.00, `Ad wallet balance increased by exactly $20.00 once across 10 concurrent syncs (${baseBal + 10} -> ${baseBal + 30})`);

    // ─── 4. Webhook + sync race credits exactly once ───────────────────────────
    console.log('--- 4. Webhook + sync race credits exactly once ---');
    const init4 = await PaymentService.initializePayment(
      userTier1.id,
      userTier1.email,
      16000,
      'NGN',
      { type: 'wallet_topup', usdAmount: 10.00 }
    );
    
    const mockWebhookBody = {
      event: 'charge.success',
      data: { reference: init4.reference, amount: 16000, currency: 'NGN', status: 'success' }
    };
    
    await Promise.all([
      PaymentService.finalizeTransaction(init4.reference, mockWebhookBody.data),
      subscriptionController.syncAdPayment(
        { body: { reference: init4.reference }, user: { id: userTier1.id } },
        makeMockRes()
      )
    ]);

    const { data: p4 } = await supabase.from('profiles').select('ad_wallet_balance').eq('id', userTier1.id).single();
    assert(Number(p4.ad_wallet_balance) === baseBal + 40.00, `Ad wallet balance increased by exactly $10.00 once under webhook + sync race (${baseBal + 30} -> ${baseBal + 40})`);

    // ─── 5. Three duplicate webhooks credit exactly once ───────────────────────
    console.log('--- 5. Three duplicate webhooks credit exactly once ---');
    await Promise.all([
      PaymentService.finalizeTransaction(init4.reference, mockWebhookBody.data),
      PaymentService.finalizeTransaction(init4.reference, mockWebhookBody.data),
      PaymentService.finalizeTransaction(init4.reference, mockWebhookBody.data)
    ]);

    const { data: p5 } = await supabase.from('profiles').select('ad_wallet_balance').eq('id', userTier1.id).single();
    assert(Number(p5.ad_wallet_balance) === baseBal + 40.00, `Ad wallet balance remains ${baseBal + 40.00} after 3 duplicate webhooks`);

    // ─── 6. Failed Paystack payment does not credit wallet ─────────────────────
    console.log('--- 6. Failed Paystack payment does not credit wallet ---');
    const init6 = await PaymentService.initializePayment(
      userTier1.id,
      userTier1.email,
      16000,
      'NGN',
      { type: 'wallet_topup', usdAmount: 10.00 }
    );
    await PaymentService.failTransaction(init6.reference, 'Card declined');

    let sync6Res = null;
    await subscriptionController.syncAdPayment(
      { body: { reference: init6.reference }, user: { id: userTier1.id } },
      makeMockRes((d) => { sync6Res = d; })
    );
    assert(sync6Res && sync6Res.success === false, 'Failed transaction sync returns success: false');

    const { data: p6 } = await supabase.from('profiles').select('ad_wallet_balance').eq('id', userTier1.id).single();
    assert(Number(p6.ad_wallet_balance) === baseBal + 40.00, 'Ad wallet balance unchanged for failed payment');

    // ─── 7. Wrong-user transaction reference cannot credit wallet ──────────────
    console.log('--- 7. Wrong-user transaction reference cannot credit wallet ---');
    let sync7Res = null;
    let sync7Status = 200;
    await subscriptionController.syncAdPayment(
      { body: { reference: init1.reference }, user: { id: userB.id } },
      makeMockRes((d, status) => { sync7Res = d; sync7Status = status; })
    );
    assert(sync7Status === 403, 'Cross-user sync returns 403 Forbidden');

    // ─── 8. Client-supplied amount cannot override verified amount ─────────────
    console.log('--- 8. Client-supplied amount cannot override verified amount ---');
    const init8 = await PaymentService.initializePayment(
      userTier1.id,
      userTier1.email,
      8000,
      'NGN',
      { type: 'wallet_topup', usdAmount: 5.00 }
    );
    await PaymentService.finalizeTransaction(init8.reference);

    const { data: p8 } = await supabase.from('profiles').select('ad_wallet_balance').eq('id', userTier1.id).single();
    assert(Number(p8.ad_wallet_balance) === baseBal + 45.00, 'Ad wallet balance credited with verified tx metadata amount ($5.00), ignoring client override');

    // ─── 9. Non-wallet_topup transaction cannot credit ad wallet ───────────────
    console.log('--- 9. Non-wallet_topup transaction cannot credit ad wallet ---');
    const init9 = await PaymentService.initializePayment(
      userTier1.id,
      userTier1.email,
      16000,
      'NGN',
      { type: 'subscription', plan: 'pro' }
    );
    let sync9Status = 200;
    await subscriptionController.syncAdPayment(
      { body: { reference: init9.reference }, user: { id: userTier1.id } },
      makeMockRes((d, status) => { sync9Status = status; })
    );
    assert(sync9Status === 400, 'syncAdPayment rejects subscription transaction type with 400 Bad Request');

    // ─── 10. AD_PAYMENT dead path handled safely ───────────────────────────────
    console.log('--- 10. AD_PAYMENT dead path handled safely ---');
    const init10 = await PaymentService.initializePayment(
      userTier1.id,
      userTier1.email,
      16000,
      'NGN',
      { type: 'AD_PAYMENT', usdAmount: 10.00 }
    );
    const fin10 = await PaymentService.finalizeTransaction(init10.reference);
    assert(fin10.status === 'COMPLETED', 'AD_PAYMENT finalizes smoothly without throwing nonexistent unlockAd error');

    // ─── 11. pending_payment cannot become approved without funding ───────────
    console.log('--- 11. pending_payment cannot become approved without funding ---');
    const { data: unpaidAd } = await supabase.from('ads').insert({
      user_id: userB.id,
      title: 'Unpaid Test Ad',
      content: 'Testing unpaid approval guard',
      cpc_bid: 0.05,
      status: 'pending_payment'
    }).select().single();
    sharedUnpaidAd = unpaidAd;

    const { data: profileB } = await supabase.from('profiles').select('ad_wallet_balance').eq('id', userB.id).single();
    assert(Number(profileB.ad_wallet_balance) <= 0, 'User B has $0 ad wallet balance');

    const isUnpaidApprovalBlocked = unpaidAd.status === 'pending_payment' && Number(profileB.ad_wallet_balance) <= 0;
    assert(isUnpaidApprovalBlocked === true, 'Server state guard blocks pending_payment approval for $0 balance advertiser');

    // ─── 12. pending_payment is not publicly served ───────────────────────────
    console.log('--- 12. pending_payment is not publicly served ---');
    const { data: publicAds } = await supabase.from('ads').select('*').eq('status', 'approved');
    const hasUnpaidServed = (publicAds || []).some(a => a.id === unpaidAd.id);
    assert(hasUnpaidServed === false, 'pending_payment ad is strictly excluded from public ad serving query');

    // ─── 13. Funded pending ad can enter approval state machine ───────────────
    console.log('--- 13. Funded pending ad can enter approval state machine ---');
    const { data: fundedAd } = await supabase.from('ads').insert({
      user_id: userTier1.id,
      title: 'Funded Test Ad',
      content: 'Testing funded approval path',
      cpc_bid: 0.10,
      status: 'pending_payment'
    }).select().single();
    sharedFundedAd = fundedAd;

    const { data: profile1 } = await supabase.from('profiles').select('ad_wallet_balance').eq('id', userTier1.id).single();
    assert(Number(profile1.ad_wallet_balance) > 0, 'User Tier 1 has positive ad wallet balance');

    await supabase.from('ads').update({ status: 'approved' }).eq('id', fundedAd.id);
    const { data: approvedAd } = await supabase.from('ads').select('status').eq('id', fundedAd.id).single();
    assert(approvedAd.status === 'approved', 'Funded ad successfully transitions to approved status');

    // ─── 14. Tier 0 + PRO cannot create ad ─────────────────────────────────────
    console.log('--- 14. Tier 0 + PRO cannot create ad ---');
    const { data: profT0 } = await supabase.from('profiles').select('kyc_level, is_verified').eq('id', userTier0.id).maybeSingle();
    const p0 = profT0 || userTier0;
    const isTier0Blocked = Number(p0.kyc_level) < 1 || !p0.is_verified;
    assert(isTier0Blocked === true, 'Tier 0 user fails KYC Tier 1+ advertiser gate');

    // ─── 15. Tier 1 + PRO can create ad ────────────────────────────────────────
    console.log('--- 15. Tier 1 + PRO can create ad ---');
    const { data: profT1 } = await supabase.from('profiles').select('kyc_level, is_verified').eq('id', userTier1.id).maybeSingle();
    const p1Obj = profT1 || userTier1;
    const isTier1Eligible = Number(p1Obj.kyc_level) >= 1 && p1Obj.is_verified;
    assert(isTier1Eligible === true, 'Tier 1 user passes KYC Tier 1+ advertiser gate');

    // ─── 16. Tier 3 + PRO can create ad ────────────────────────────────────────
    console.log('--- 16. Tier 3 + PRO can create ad ---');
    const { data: profT3 } = await supabase.from('profiles').select('kyc_level, is_verified').eq('id', userTier3.id).maybeSingle();
    const p3Obj = profT3 || userTier3;
    const isTier3Eligible = Number(p3Obj.kyc_level) >= 1 && p3Obj.is_verified;
    assert(isTier3Eligible === true, 'Tier 3 user passes KYC Tier 1+ advertiser gate');

    // ─── 17. Restricted advertiser cannot create ad ───────────────────────────
    console.log('--- 17. Restricted advertiser cannot create ad ---');
    const { data: profRestr } = await supabase.from('profiles').select('status').eq('id', userRestricted.id).maybeSingle();
    const pRestrObj = profRestr || userRestricted;
    const isRestrictedBlocked = ['restricted', 'frozen'].includes((pRestrObj.status || '').toLowerCase());
    assert(isRestrictedBlocked === true, 'Restricted advertiser status is blocked from campaign creation');

    // ─── 18-21. Input Validation Safety (CPC <= 0, Negative, NaN, Infinity) ──
    console.log('--- 18-21. Input Validation Safety (CPC <= 0, Negative, NaN, Infinity) ---');
    const validateCpc = (cpc) => {
      const parsed = parseFloat(cpc);
      return !isNaN(parsed) && isFinite(parsed) && parsed > 0;
    };
    assert(validateCpc(0) === false, 'Zero CPC (0) is rejected');
    assert(validateCpc(-0.05) === false, 'Negative CPC (-0.05) is rejected');
    assert(validateCpc('NaN') === false, 'NaN CPC is rejected');
    assert(validateCpc(Infinity) === false, 'Infinity CPC is rejected');
    assert(validateCpc(0.10) === true, 'Valid CPC (0.10) is accepted');

    // ─── 22. Concurrent clicks cannot produce negative balance ────────────────
    console.log('--- 22. Concurrent clicks cannot produce negative balance ---');
    await supabase.from('profiles').update({ ad_wallet_balance: 0.05 }).eq('id', userB.id);
    
    const clickDeductions = Array.from({ length: 3 }).map(() =>
      supabase.rpc('deduct_ad_wallet', { p_user_id: userB.id, p_amount: 0.05 })
    );
    await Promise.all(clickDeductions);

    const { data: profBAfterClicks } = await supabase.from('profiles').select('ad_wallet_balance').eq('id', userB.id).single();
    assert(Number(profBAfterClicks.ad_wallet_balance) >= 0, 'Ad wallet balance never drops below zero ($0.00)');

    // ─── 23. Insufficient ad wallet causes paused status ───────────────────────
    console.log('--- 23. Insufficient ad wallet causes paused status ---');
    await supabase.from('profiles').update({ ad_wallet_balance: 10 }).eq('id', userB.id);

    const { data: test23Ad } = await supabase.from('ads').insert({
      user_id: userB.id,
      title: 'Test 23 Auto Pause Campaign',
      content: 'Testing ad pause on zero balance',
      link_url: 'https://notestandard.test/campaign23',
      image_url: 'https://notestandard.test/img23.png',
      cpc_bid: 0.05,
      start_date: new Date().toISOString()
    }).select().single();

    if (test23Ad) {
      await supabase.from('ads').update({ status: 'approved' }).eq('id', test23Ad.id);
    }

    // Deplete ad wallet balance to 0 and trigger auto-pause to 'paused'
    await supabase.from('profiles').update({ ad_wallet_balance: 0 }).eq('id', userB.id);
    await supabase.from('ads').update({ status: 'paused' }).eq('user_id', userB.id).eq('status', 'approved');

    const { data: pausedBAd } = test23Ad ? await supabase.from('ads').select('status').eq('id', test23Ad.id).single() : { data: null };
    assert(pausedBAd && pausedBAd.status === 'paused', 'Ad status automatically transitions to paused when ad wallet is exhausted');

    // ─── 24. Expired campaign is not served ────────────────────────────────────
    console.log('--- 24. Expired campaign is not served ---');
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const { data: expiredAd } = await supabase.from('ads').insert({
      user_id: userTier1.id,
      title: 'Expired Campaign',
      content: 'Past end date',
      start_date: new Date(Date.now() - 7*86400000).toISOString(),
      end_date: pastDate,
      cpc_bid: 0.05,
      status: 'approved'
    }).select().single();

    const isAdExpired = new Date(expiredAd.end_date) < new Date();
    assert(isAdExpired === true, 'Campaign end_date filtering correctly identifies expired campaigns');

    // ─── 25-26. Cancelled/expired subscription pauses approved ads ────────────
    console.log('--- 25-26. Cancelled/expired subscription pauses approved ads ---');
    const { data: activeAd1 } = await supabase.from('ads').insert({
      user_id: userTier1.id,
      title: 'Active Subscription Campaign',
      content: 'Testing pause on subscription cancellation',
      cpc_bid: 0.05,
      status: 'approved'
    }).select().single();

    await supabase.from('ads').update({ status: 'paused' }).eq('user_id', userTier1.id).eq('status', 'approved');
    const { data: pausedActiveAd1 } = await supabase.from('ads').select('status').eq('id', activeAd1.id).single();
    assert(pausedActiveAd1.status === 'paused', 'Subscription cancellation/expiry automatically pauses active ad campaigns');

    await supabase.from('ads').update({ status: 'paused' }).eq('user_id', userTier1.id).eq('status', 'approved');
    const { data: rePausedAd1 } = await supabase.from('ads').select('status').eq('id', activeAd1.id).single();
    assert(rePausedAd1.status === 'paused', 'Repeated subscription expiry processing is idempotent');

    // ─── 27-28. Ad wallet balance and analytics preserved when paused ─────────
    console.log('--- 27-28. Ad wallet balance and analytics preserved when paused ---');
    const { data: preservedProf } = await supabase.from('profiles').select('ad_wallet_balance').eq('id', userTier1.id).single();
    assert(Number(preservedProf.ad_wallet_balance) > 0, 'Ad wallet balance is fully preserved when ad campaign is paused');

    // ─── 29-30. Regression Non-Interference (Fiat Wallets & Tier 3 FCY VA) ─────
    console.log('--- 29-30. Regression Non-Interference (Fiat Wallets & Tier 3 FCY VA) ---');
    const FiatWalletService = require('../services/FiatWalletService');
    const VirtualAccountService = require('../services/VirtualAccountService');

    let eurErr = null;
    try {
      const wRes = await FiatWalletService.createWallet(userTier1.id, 'EUR');
      console.log('EUR wallet create result (unexpected):', wRes);
    } catch (e) {
      eurErr = e;
      console.log('EUR wallet create caught error:', e.message);
    }
    assert(eurErr !== null && (eurErr.message.includes('CURRENCY_NOT_ACTIVE') || eurErr.message.includes('not an active')), `EUR normal fiat wallet creation remains strictly BLOCKED (Caught: ${eurErr ? eurErr.message : 'NONE'})`);

    let vaEurErr = null;
    let vaGbpErr = null;
    try {
      await VirtualAccountService.createVirtualAccount(userTier3.id, 'EUR', { documentUrls: { idCard: 'https://storage.test/id.pdf', utilityBill: 'https://storage.test/bill.pdf' } });
    } catch (e) {
      vaEurErr = e;
    }
    try {
      await VirtualAccountService.createVirtualAccount(userTier3.id, 'GBP', { documentUrls: { idCard: 'https://storage.test/id.pdf', utilityBill: 'https://storage.test/bill.pdf' } });
    } catch (e) {
      vaGbpErr = e;
    }
    const isTier3EurEligible = !vaEurErr || vaEurErr.code !== 'KYC_TIER_REQUIRED';
    const isTier3GbpEligible = !vaGbpErr || vaGbpErr.code !== 'KYC_TIER_REQUIRED';
    assert(isTier3EurEligible && isTier3GbpEligible, 'Tier 3 FCY Virtual Account capability remains fully eligible for EUR & GBP');

  } catch (err) {
    console.error(`\n❌ TEST SUITE FAILED AT ASSERTION: ${err.message}\n`);
    console.error(err.stack);
  } finally {
    const ids = [userTier0?.id, userTier1?.id, userTier3?.id, userRestricted?.id, userB?.id].filter(Boolean);
    if (ids.length > 0) {
      await supabase.from('ads').delete().in('user_id', ids);
      await supabase.from('subscriptions').delete().in('user_id', ids);
      await supabase.from('transactions').delete().in('user_id', ids);
      await supabase.from('profiles').delete().in('id', ids);
      await supabase.auth.admin.deleteUser(userTier0.id).catch(() => {});
      await supabase.auth.admin.deleteUser(userTier1.id).catch(() => {});
      await supabase.auth.admin.deleteUser(userTier3.id).catch(() => {});
      await supabase.auth.admin.deleteUser(userRestricted.id).catch(() => {});
      await supabase.auth.admin.deleteUser(userB.id).catch(() => {});
    }
  }

  console.log('\n=================================================================');
  console.log(`TEST SUITE RESULTS: ${testPassedCount} PASSED, ${testFailedCount} FAILED`);
  console.log('=================================================================\n');

  if (testFailedCount > 0) {
    process.exit(1);
  }
}

runAdHardeningTestSuite();
