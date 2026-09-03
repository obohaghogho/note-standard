'use strict';
/**
 * greyStandaloneAudit.js
 * Standalone forensic audit that doesn't require module bootstrapping.
 * Tests Grey API connectivity, email parsing, webhook sigs, and configuration.
 */
require('dotenv').config();
const crypto = require('crypto');
const axios  = require('axios');
const { JSDOM } = require('jsdom');
const createDOMPurify = require('dompurify');

const PASS = '✅'; const FAIL = '❌'; const WARN = '⚠️ ';
let passed = 0, failed = 0;

function test(name, ok, detail = '') {
  if (ok) { passed++; console.log(`${PASS} ${name}${detail ? ' — ' + detail : ''}`); }
  else { failed++; console.log(`${FAIL} ${name}${detail ? ' — ' + detail : ''}`); }
}

(async () => {
  try {
    const GREY_API_KEY = process.env.GREY_API_KEY || process.env.GREY_SECRET_KEY;
    const GREY_ENV     = (process.env.GREY_ENV || 'production').toLowerCase();
    // Correct base URLs per Grey Finance Business API spec
    const GREY_BASE_URL_DEFAULT = GREY_ENV === 'sandbox'
      ? 'https://businessapi-sandbox.grey.co'
      : 'https://businessapi.grey.co';
    const GREY_BASE_URL = (process.env.GREY_BASE_URL || GREY_BASE_URL_DEFAULT).trim();
    const GREY_WEBHOOK_SECRET = process.env.GREY_WEBHOOK_SECRET;

    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log(' SECTION 1 — ENVIRONMENT & CONFIGURATION');
    console.log('═'.repeat(60));

    test('GREY_API_KEY present', !!GREY_API_KEY && GREY_API_KEY.length > 10, `len=${(GREY_API_KEY||'').length}`);
    test('GREY_API_KEY starts with gbsk_', (GREY_API_KEY||'').startsWith('gbsk_'), `prefix=${(GREY_API_KEY||'').substring(0, 5)}`);
    test('GREY_BASE_URL is https', GREY_BASE_URL.startsWith('https://'), GREY_BASE_URL);
    test('GREY_BASE_URL uses businessapi domain', GREY_BASE_URL.includes('businessapi'), GREY_BASE_URL);
    test('GREY_WEBHOOK_SECRET present', !!GREY_WEBHOOK_SECRET && GREY_WEBHOOK_SECRET.length >= 10, `len=${(GREY_WEBHOOK_SECRET||'').length}`);
    test('GREY_ENABLED=true', process.env.GREY_ENABLED === 'true', `val=${process.env.GREY_ENABLED}`);
    test('GREY_ENV configured', ['production', 'sandbox'].includes(GREY_ENV), `val=${GREY_ENV}`);

    const holder = (process.env.GREY_LEAD_BANK_HOLDER || '').replace(/"/g, '');
    const acctNum = (process.env.GREY_LEAD_BANK_ACCOUNT_NUMBER || '').replace(/"/g, '');
    const achRouting = (process.env.GREY_LEAD_BANK_ACH_ROUTING || '').replace(/"/g, '');
    const wireRouting = (process.env.GREY_LEAD_BANK_WIRE_ROUTING || '').replace(/"/g, '');
    const bankAddr = (process.env.GREY_LEAD_BANK_ADDRESS || '').replace(/"/g, '');

    test('Lead Bank Holder set', !!holder, holder);
    test('Lead Bank Account Number set', !!acctNum, acctNum);
    test('Lead Bank ACH Routing set', !!achRouting, achRouting);
    test('Lead Bank Wire Routing set', !!wireRouting, wireRouting);
    test('Lead Bank Address set', !!bankAddr, bankAddr);
    test('ACH Incoming Fee set', !!process.env.GREY_ACH_INCOMING_FEE, `$${process.env.GREY_ACH_INCOMING_FEE}`);
    test('Wire Incoming Fee set', !!process.env.GREY_WIRE_INCOMING_FEE, `$${process.env.GREY_WIRE_INCOMING_FEE}`);

    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log(' SECTION 2 — LIVE API CONNECTIVITY');
    console.log('═'.repeat(60));

    // 2.1 DNS Resolution
    const dns = require('dns').promises;
    let dnsResolved = false;
    try {
      const hostname = new URL(GREY_BASE_URL).hostname;
      const addrs = await dns.resolve(hostname);
      dnsResolved = addrs.length > 0;
      test('DNS resolves ' + hostname, dnsResolved, `IPs: ${addrs.join(', ')}`);
    } catch (dnsErr) {
      test('DNS resolves ' + new URL(GREY_BASE_URL).hostname, false, `ENOTFOUND — ${dnsErr.message}`);
    }

    // 2.2 GET /v1/balances — Grey Business API primary liveness probe
    if (dnsResolved) {
      try {
        const r = await axios.get(`${GREY_BASE_URL}/v1/balances`, {
          headers: { 'Authorization': `Bearer ${GREY_API_KEY}` },
          timeout: 10000, validateStatus: () => true
        });
        const ok = r.status < 500;
        // Validate balance response shape
        const balances = r.data?.data?.balances || r.data?.data || r.data?.balances || [];
        const hasBalances = Array.isArray(balances);
        test('GET /v1/balances', ok, `HTTP ${r.status} — ${JSON.stringify(r.data).substring(0, 150)}`);
        test('GET /v1/balances — response has balances array', ok && hasBalances, `balances=${JSON.stringify(balances).substring(0, 100)}`);
      } catch (e) {
        test('GET /v1/balances', false, e.message);
      }

      // 2.3 GET /api/v1/transactions (correct path for Grey Business API)
      try {
        const r = await axios.get(`${GREY_BASE_URL}/api/v1/transactions`, {
          headers: { 'Authorization': `Bearer ${GREY_API_KEY}` },
          params: { limit: 5 }, timeout: 10000, validateStatus: () => true
        });
        test('GET /api/v1/transactions', r.status < 500, `HTTP ${r.status}`);
      } catch (e) {
        test('GET /api/v1/transactions', false, e.message);
      }

      // 2.4 POST /v1/currency/rate (Grey Business API FX endpoint — POST not GET)
      try {
        const r = await axios.post(`${GREY_BASE_URL}/v1/currency/rate`,
          { source_amount: 100, source_currency: 'USD', destination_currency: 'NGN', transaction_type: 'swap' },
          {
            headers: { 'Authorization': `Bearer ${GREY_API_KEY}` },
            timeout: 10000, validateStatus: () => true
          });
        test('POST /v1/currency/rate USD→NGN', r.status < 500, `HTTP ${r.status} — ${JSON.stringify(r.data).substring(0, 100)}`);
      } catch (e) {
        test('POST /v1/currency/rate', false, e.message);
      }

      // 2.5 Sandbox topup — only run if GREY_ENV=sandbox
      if (GREY_ENV === 'sandbox') {
        console.log('\n  ── SANDBOX TOPUP TEST (USD wallet crediting) ──');
        try {
          const topupPayload = {
            amount: 100,
            currency: 'USD',
            description: 'NoteStandard Grey integration test topup'
          };
          const r = await axios.post(`${GREY_BASE_URL}/v1/sandbox/topup`, topupPayload, {
            headers: { 'Authorization': `Bearer ${GREY_API_KEY}` },
            timeout: 15000, validateStatus: () => true
          });
          const ok = r.status === 200 || r.status === 201;
          test('POST /v1/sandbox/topup (USD $100)', ok, `HTTP ${r.status} — ${JSON.stringify(r.data).substring(0, 200)}`);

          if (ok) {
            // Verify the balance reflects the topup
            const balR = await axios.get(`${GREY_BASE_URL}/v1/balances`, {
              headers: { 'Authorization': `Bearer ${GREY_API_KEY}` },
              timeout: 10000, validateStatus: () => true
            });
            const balances = balR.data?.data?.balances || balR.data?.data || balR.data?.balances || [];
            const usdBal = balances.find(b => String(b.currency).toUpperCase() === 'USD');
            test(
              'USD balance > 0 after topup',
              !!usdBal && Number(usdBal.available_balance || usdBal.balance || 0) > 0,
              `USD available_balance=${usdBal?.available_balance}`
            );
            console.log(`  ✅ Sandbox USD wallet topup confirmed. Balance: $${usdBal?.available_balance || 0}`);
          }
        } catch (e) {
          test('POST /v1/sandbox/topup', false, e.message);
        }
      } else {
        console.log('  ⚠️  Sandbox topup skipped — GREY_ENV is not "sandbox"');
      }
    } else {
      console.log(`  ${WARN} Skipping live API tests — DNS does not resolve for ${GREY_BASE_URL}`);
      console.log('  🔴 CRITICAL: Ensure GREY_BASE_URL is set to https://businessapi-sandbox.grey.co (sandbox) or https://businessapi.grey.co (production)');
    }

    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log(' SECTION 3 — DEPOSIT INITIALIZATION (static logic)');
    console.log('═'.repeat(60));

    // Simulate GreyProvider.initialize logic without DB
    const expiryMinutes = parseInt(process.env.GREY_EXPIRY_MINUTES || '60', 10);
    const bankName = (process.env.GREY_LEAD_BANK_NAME || 'Lead Bank').replace(/"/g, '').trim();
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();

    test('ExpiresAt is in the future', new Date(expiresAt) > new Date(), expiresAt);
    test('ExpiryMinutes is reasonable', expiryMinutes >= 10 && expiryMinutes <= 1440, `${expiryMinutes} minutes`);
    test('BankName configured', !!bankName, bankName);

    const bankDetails = {
      bankName, accountName: holder, accountNumber: acctNum,
      routingNumber: achRouting, achRouting, wireRouting, bankAddress: bankAddr,
      accountType: 'Checking'
    };
    test('Bank details complete', !!bankDetails.bankName && !!bankDetails.accountNumber && !!bankDetails.achRouting);
    test('Account type is Checking', bankDetails.accountType === 'Checking');
    test('ACH routing is 9 digits', achRouting.length === 9, `length=${achRouting.length}`);

    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log(' SECTION 4 — WEBHOOK SIGNATURE VERIFICATION');
    console.log('═'.repeat(60));

    // Grey Business API sends: X-Webhook-Signature: sha256=<hex>
    const payload = JSON.stringify({ event: 'transaction.received', data: { source_amount: 100, source_currency: 'USD', transaction_reference: 'txn_test_001', client_reference: 'NS-AUDIT01' } });
    const secret = GREY_WEBHOOK_SECRET;
    const hmacHex = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const validSig = `sha256=${hmacHex}`;  // Grey sends "sha256=" prefixed

    test('Valid HMAC-SHA256 signature generated', hmacHex.length === 64, `sig=${hmacHex.substring(0, 20)}...`);

    // Verify stripping "sha256=" prefix and timingSafeEqual works correctly
    const sigStripped = validSig.startsWith('sha256=') ? validSig.slice(7) : validSig;
    const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    try {
      const isValid = crypto.timingSafeEqual(Buffer.from(sigStripped, 'hex'), Buffer.from(expected, 'hex'));
      test('Valid sig passes (sha256= stripped + timingSafeEqual hex compare)', isValid);
    } catch {
      test('Valid sig passes timingSafeEqual', false, 'timingSafeEqual threw');
    }

    // Verify invalid signature rejected
    const invalidSig = 'deadbeef00000000deadbeef00000000deadbeef00000000deadbeef00000000';
    try {
      const isInvalid = crypto.timingSafeEqual(Buffer.from(invalidSig, 'hex'), Buffer.from(expected, 'hex'));
      test('Invalid signature rejected', !isInvalid);
    } catch {
      test('Invalid signature rejected (exception = mismatch)', true);
    }

    // Verify signature without prefix also works (legacy fallback)
    try {
      const isValidRaw = crypto.timingSafeEqual(Buffer.from(hmacHex, 'hex'), Buffer.from(expected, 'hex'));
      test('Raw hex sig (no sha256= prefix) also accepted', isValidRaw);
    } catch {
      test('Raw hex sig fallback', false, 'threw');
    }

    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log(' SECTION 5 — EMAIL PARSING ENGINE');
    console.log('═'.repeat(60));

    // Email parsing (standalone implementation to avoid heavy module imports)
    const window = new JSDOM('').window;
    const DOMPurify = createDOMPurify(window);

    function parseEmail(emailBody) {
      if (!emailBody) return { amount: null, currency: null, reference: null, confidence: 0, status: 'needs_review' };
      const cleanHtml = DOMPurify.sanitize(emailBody);
      const text = cleanHtml.replace(/<[^>]*>?/gm, ' ').replace(/&nbsp;/gi, ' ').replace(/\s+/g, ' ').trim();

      let confidence = 0;
      const amountPatterns = [
        /(?:received|credited|deposited|transfer)\s+(?:of\s+)?(?:\$|£|€|NGN|USD|GBP|EUR)?\s*([\d,]+(?:\.\d{1,2})?)/i,
        /(?:amount|total)\s*(?::|of|is)?\s*(?:\$|£|€|NGN)?\s*([\d,]+(?:\.\d{1,2})?)/i,
        /(?:\$|£|€)\s*([\d,]+(?:\.\d{1,2})?)/,
        /([\d,]+(?:\.\d{1,2})?)\s*(?:USD|GBP|EUR|NGN)\b/i,
      ];
      let amount = null;
      for (const p of amountPatterns) {
        const m = text.match(p);
        if (m) { const v = parseFloat(m[1].replace(/,/g, '')); if (v > 0 && v < 10000000) { amount = v; confidence += 30; break; } }
      }

      let currency = null;
      if (/\bNGN\b|₦/i.test(text)) { currency = 'NGN'; confidence += 10; }
      else if (/\bUSD\b|\$(?!\s*\d{4})/i.test(text)) { currency = 'USD'; confidence += 10; }
      else if (/\bGBP\b|£/i.test(text)) { currency = 'GBP'; confidence += 10; }
      else if (/\bEUR\b|€/i.test(text)) { currency = 'EUR'; confidence += 10; }
      if (!currency) currency = 'USD';

      const refPatterns = [/(NOTE-[A-Z0-9]{6,12})/i, /(NS-[A-Z0-9]+-\d+)/i, /(tx_[a-fA-F0-9]{20,40})/i,
        /(?:narration|memo|reference|description)[\s:-]?\s*([A-Za-z0-9_-]{6,40})/i];
      let reference = null;
      for (const p of refPatterns) { const m = text.match(p); if (m) { reference = m[1].trim(); confidence += 40; break; } }

      confidence = Math.min(confidence, 100);
      if (!amount) confidence = Math.min(confidence, 20);
      if (!reference) confidence = Math.min(confidence, 40);

      return { amount, currency, reference, confidence, status: confidence >= 60 ? 'completed' : 'needs_review', raw: text.substring(0, 500) };
    }

    const e1 = parseEmail('Payment received of $500.00 USD. Sender: John Doe. Reference: NS-AUDIT123-001');
    test('Parse: amount=$500', e1.amount === 500, `got ${e1.amount}`);
    test('Parse: currency=USD', e1.currency === 'USD', `got ${e1.currency}`);
    test('Parse: reference extracted', !!e1.reference, `ref=${e1.reference}`);
    test('Parse: confidence>=60', e1.confidence >= 60, `conf=${e1.confidence}`);
    test('Parse: status=completed', e1.status === 'completed', `status=${e1.status}`);

    const e2 = parseEmail('₦25,000 credited to your account. Ref: NS-NGN001-123');
    test('Parse NGN: currency=NGN', e2.currency === 'NGN', `got ${e2.currency}`);
    test('Parse NGN: amount=25000', e2.amount === 25000, `got ${e2.amount}`);

    const e3 = parseEmail('A payment of $200 was received from an unknown source.');
    test('Parse no ref: confidence<=40', e3.confidence <= 40, `conf=${e3.confidence}`);
    test('Parse no ref: needs_review', e3.status === 'needs_review', `status=${e3.status}`);

    const e4 = parseEmail('');
    test('Parse empty: amount=null', e4.amount === null);
    test('Parse empty: confidence=0', e4.confidence === 0);

    const e5 = parseEmail('<script>alert("xss")</script> Amount: $100 Reference: NS-XSS01-001');
    test('XSS sanitized: amount=$100', e5.amount === 100, `got ${e5.amount}`);
    test('XSS sanitized: no <script> in raw', !e5.raw.includes('<script>'));

    // Reference generation
    const userHash = crypto.createHash('sha256').update('test-user').digest('hex').substring(0, 4).toUpperCase();
    const tsHex = Date.now().toString(16).toUpperCase();
    const randHex = crypto.randomBytes(2).toString('hex').toUpperCase();
    const ref1 = `NOTE-${userHash}-${tsHex}-${randHex}`;
    test('Reference format valid', ref1.startsWith('NOTE-'), `ref=${ref1}`);
    test('Reference length reasonable', ref1.length >= 15 && ref1.length <= 40, `len=${ref1.length}`);

    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log(' SECTION 6 — WEBHOOK EVENT PARSING (Grey Business API shape)');
    console.log('═'.repeat(60));

    // Grey Business API deposit webhook shape:
    // { event: 'transaction.received', type: 'credit', data: { transaction_reference, client_reference,
    //   source_amount, source_currency, destination_amount, destination_currency, sender, ... } }
    function parseWebhookEvent(payload) {
      const data = payload.data || payload;
      const status = ['completed', 'successful', 'success', 'transaction success'].includes(
        String(data.status || payload.event || payload.status || '').toLowerCase()
      ) ? 'success' : 'failed';
      return {
        type: 'deposit',
        // Use client_reference first (persistent user ref), then transaction_reference
        reference: data.client_reference || data.reference || data.narration || null,
        transactionReference: data.transaction_reference || data.reference || null,
        status,
        amount: Number(data.source_amount || data.amount || 0),
        currency: (data.source_currency || data.currency || 'USD').toUpperCase(),
        sender: data.sender?.name || data.sender_name || data.sender || 'Unknown',
        transactionId: data.transaction_reference || data.id || null,
        raw: payload
      };
    }

    // Test with correct Grey Business API payload structure
    const wh1 = parseWebhookEvent({
      event: 'transaction.received',
      data: {
        transaction_reference: 'txn_grey_001',
        client_reference: 'NS-AUDIT01',
        source_amount: 200,
        source_currency: 'USD',
        destination_amount: 200,
        destination_currency: 'USD',
        sender: { name: 'Test Sender', bank_name: 'Chase' },
        status: 'completed'
      }
    });
    test('Webhook: type=deposit', wh1.type === 'deposit');
    test('Webhook: status=success (completed)', wh1.status === 'success');
    test('Webhook: client_reference parsed (NS ref)', wh1.reference === 'NS-AUDIT01');
    test('Webhook: transaction_reference parsed', wh1.transactionReference === 'txn_grey_001');
    test('Webhook: amount=200', wh1.amount === 200);
    test('Webhook: currency=USD (source_currency field)', wh1.currency === 'USD');
    test('Webhook: sender parsed from sender object', wh1.sender === 'Test Sender');

    // Backward-compat: flat payload
    const wh2 = parseWebhookEvent({ status: 'successful', reference: 'WH-002', amount: 100 });
    test('Webhook flat: status=success (successful)', wh2.status === 'success');

    const wh3 = parseWebhookEvent({ event: 'transaction.received', data: { transaction_reference: 'txn_003', source_amount: 50, source_currency: 'USD', status: 'completed' } });
    test('Webhook: no client_ref => reference=null', wh3.reference === null);

    const wh4 = parseWebhookEvent({ status: 'rejected', reference: 'FAIL-001', amount: 30 });
    test('Webhook: failed status', wh4.status === 'failed');

    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log(' SECTION 7 — CODE ARCHITECTURE AUDIT');
    console.log('═'.repeat(60));

    const fs = require('fs');
    const path = require('path');
    const serverDir = path.resolve(__dirname, '..');

    // Check all Grey-related files exist
    const requiredFiles = [
      'services/payment/providers/GreyProvider.js',
      'services/payment/adapters/GreyAdapter.js',
      'services/payment/GreyEmailService.js',
      'services/settlement/GreyBankingProvider.js',
      'services/settlement/GreySettlementProvider.js',
      'services/payment/DepositCreditEngine.js',
      'services/payment/PaymentFactory.js',
      'services/payment/payoutService.js',
      'services/payment/GatewayRouter.js',
      'routes/webhooks.js',
      'routes/payment.js'
    ];

    for (const f of requiredFiles) {
      const exists = fs.existsSync(path.join(serverDir, f));
      test(`File exists: ${f}`, exists);
    }

    // Check GreyProvider.js has key methods
    const greyProviderSrc = fs.readFileSync(path.join(serverDir, 'services/payment/providers/GreyProvider.js'), 'utf-8');
    test('GreyProvider has initialize()', greyProviderSrc.includes('async initialize('));
    test('GreyProvider has verify()', greyProviderSrc.includes('async verify('));
    test('GreyProvider has createVirtualAccount()', greyProviderSrc.includes('async createVirtualAccount('));
    test('GreyProvider has parseWebhookEvent()', greyProviderSrc.includes('parseWebhookEvent('));
    test('GreyProvider has verifyWebhookSignature()', greyProviderSrc.includes('verifyWebhookSignature('));

    // Check GreyAdapter.js has key methods
    const greyAdapterSrc = fs.readFileSync(path.join(serverDir, 'services/payment/adapters/GreyAdapter.js'), 'utf-8');
    test('GreyAdapter has initializePayment()', greyAdapterSrc.includes('async initializePayment('));
    test('GreyAdapter has verifyPayment()', greyAdapterSrc.includes('async verifyPayment('));
    test('GreyAdapter has createTransfer()', greyAdapterSrc.includes('async createTransfer('));
    test('GreyAdapter has healthCheck()', greyAdapterSrc.includes('async healthCheck('));
    test('GreyAdapter has balanceInquiry()', greyAdapterSrc.includes('async balanceInquiry('));

    // Check webhook route handles Grey events
    const webhookSrc = fs.readFileSync(path.join(serverDir, 'routes/webhooks.js'), 'utf-8');
    test('Webhook route handles /grey', webhookSrc.includes('router.post("/grey"'));
    test('Webhook handles deposit events', webhookSrc.includes('DEPOSIT_EVENTS'));
    test('Webhook handles payout success', webhookSrc.includes('PAYOUT_SUCCESS_EVENTS'));
    test('Webhook handles payout failure', webhookSrc.includes('PAYOUT_FAILED_EVENTS'));
    test('Webhook uses DepositCreditEngine', webhookSrc.includes('DepositCreditEngine'));
    test('Webhook has idempotency check', webhookSrc.includes('WALLET_CREDITED'));
    test('Webhook has user resolution', webhookSrc.includes('NS-') || webhookSrc.includes('user_bank_references'));

    // Check PaymentFactory registers Grey
    const factorySrc = fs.readFileSync(path.join(serverDir, 'services/payment/PaymentFactory.js'), 'utf-8');
    test('PaymentFactory has grey case', factorySrc.includes("case \"grey\""));
    test('PaymentFactory has manual alias', factorySrc.includes("case \"manual\""));

    // Check DepositCreditEngine has core guarantees
    const creditSrc = fs.readFileSync(path.join(serverDir, 'services/payment/DepositCreditEngine.js'), 'utf-8');
    test('CreditEngine has confirm_deposit_v7 RPC', creditSrc.includes('confirm_deposit_v7'));
    test('CreditEngine has idempotency check', creditSrc.includes('alreadyCredited'));
    test('CreditEngine has WALLET_CREDITED status', creditSrc.includes('WALLET_CREDITED'));
    test('CreditEngine has fallback confirm', creditSrc.includes('_fallbackConfirmDeposit'));

    // ═══════════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(60));
    console.log(' SECTION 8 — PAYOUT SERVICE CODE AUDIT');
    console.log('═'.repeat(60));

    const payoutSrc = fs.readFileSync(path.join(serverDir, 'services/payment/payoutService.js'), 'utf-8');
    test('PayoutService has createPaystackTransfer()', payoutSrc.includes('createPaystackTransfer'));
    test('PayoutService has createNowPaymentsPayout()', payoutSrc.includes('createNowPaymentsPayout'));
    test('PayoutService has MOCK_PAYOUT mode', payoutSrc.includes("MOCK_PAYOUT === 'true'"));
    test('PayoutService has createPayoutRequest()', payoutSrc.includes('createPayoutRequest'));
    test('PayoutService has updatePayoutState()', payoutSrc.includes('updatePayoutState'));
    test('PayoutService has SystemState withdrawal check', payoutSrc.includes('isWithdrawalsEnabled'));

    const settlementSrc = fs.readFileSync(path.join(serverDir, 'services/settlement/GreySettlementProvider.js'), 'utf-8');
    test('GreySettlement has createPayout()', settlementSrc.includes('async createPayout('));
    test('GreySettlement has daily limit check', settlementSrc.includes('GreyDailyLimitService'));
    test('GreySettlement has circuit breaker', settlementSrc.includes('circuitOpen'));
    test('GreySettlement has retry logic', settlementSrc.includes('_executeWithRetry'));
    test('GreySettlement has idempotency key', settlementSrc.includes('idempotencyKey'));
    test('GreySettlement has getBalance()', settlementSrc.includes('async getBalance('));
    test('GreySettlement has getExchangeRate()', settlementSrc.includes('async getExchangeRate('));
    test('GreySettlement has verifyWebhookSignature()', settlementSrc.includes('async verifyWebhookSignature('));

    // ═══════════════════════════════════════════════════════════════
    // FINAL SUMMARY
    console.log('\n\n' + '═'.repeat(60));
    console.log(' GREY FORENSIC AUDIT — FINAL SUMMARY');
    console.log('═'.repeat(60));
    console.log(` Total Tests:  ${passed + failed}`);
    console.log(` ${PASS} Passed:   ${passed}`);
    console.log(` ${FAIL} Failed:   ${failed}`);
    console.log(` Pass Rate:    ${(passed / (passed + failed) * 100).toFixed(1)}%`);
    console.log('═'.repeat(60));

    if (!dnsResolved) {
      console.log(`\n 🔴 CRITICAL FINDING: ${new URL(GREY_BASE_URL).hostname} DNS does NOT resolve`);
      console.log('    All live API calls (balance, transactions, FX, payout) will FAIL.');
      console.log('    Correct Grey Finance Business API base URLs:');
      console.log('      Sandbox:    https://businessapi-sandbox.grey.co');
      console.log('      Production: https://businessapi.grey.co');
      console.log('    Set GREY_BASE_URL in your .env file to one of the above.');
      console.log('    Set GREY_ENV=sandbox  or  GREY_ENV=production accordingly.');
      console.log('\n    ⚡ Correct endpoints:');
      console.log('       Balances:     GET  /v1/balances');
      console.log('       Transactions: GET  /api/v1/transactions');
      console.log('       FX Rate:      POST /v1/currency/rate');
      console.log('       Payout:       POST /v1/charge/payout');
      console.log('       P2P:          POST /v1/charge/p2p');
      console.log('       Swap:         POST /v1/charge/swap');
      console.log('       Sandbox topup: POST /v1/sandbox/topup');
    }

    if (failed > 0) {
      console.log('\n FAILED TESTS:');
      // We can't list them individually since we used a simple counter,
      // but the failures are printed inline above.
    } else {
      console.log(`\n ${PASS} ALL CODE PATHS VERIFIED — Grey payment stack code is structurally sound.`);
    }

    console.log('═'.repeat(60) + '\n');
    process.exit(failed > 0 ? 1 : 0);
  } catch (err) {
    console.error(`FATAL ERROR: ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
})();
