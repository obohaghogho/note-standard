'use strict';

const BankingProviderRouter = require('../services/settlement/BankingProviderRouter');
const CurrencyFeatureService = require('../services/payment/CurrencyFeatureService');
const { CURRENCY_REGISTRY } = require('../config/CurrencyRegistry');
const paymentService = require('../services/payment/paymentService');

async function runGhsAudit() {
  console.log('--- Starting GHS Deposit Acceptance & Dual-Channel Test Audit ---');

  // 1. Verify GHS in CurrencyRegistry
  const ghsConfig = CURRENCY_REGISTRY.find(c => c.code === 'GHS');
  console.log('1. GHS CurrencyRegistry Config:', {
    code: ghsConfig?.code,
    status: ghsConfig?.status,
    enabled: ghsConfig?.enabled,
    visible: ghsConfig?.visible
  });

  if (ghsConfig?.status !== 'LIVE' || !ghsConfig?.enabled || !ghsConfig?.visible) {
    throw new Error('GHS currency config is not LIVE/enabled/visible');
  }

  // 2. Verify EUR/GBP hidden status
  const visibleCurrencies = CurrencyFeatureService.getVisibleCurrencies(false, 'production');
  console.log('2. Production Visible Currencies:', visibleCurrencies);
  if (visibleCurrencies.includes('EUR') || visibleCurrencies.includes('GBP')) {
    throw new Error('EUR or GBP is visible in production mode!');
  }
  if (!visibleCurrencies.includes('NGN') || !visibleCurrencies.includes('USD') || !visibleCurrencies.includes('GHS')) {
    throw new Error('NGN, USD, or GHS is missing from production visible currencies!');
  }

  // 3. Test GHS Bank Transfer Instructions
  console.log('3. Fetching GHS Bank Transfer instructions via BankingProviderRouter...');
  const testUserId = '8677bd57-6fdf-46a3-b237-d8ec2e4ae7cd'; // test profile
  const instructions = await BankingProviderRouter.getDepositInstructions({
    currency: 'GHS',
    rail: 'BANK_TRANSFER',
    userId: testUserId
  });

  console.log('✅ GHS Bank Transfer Output:', JSON.stringify(instructions, null, 2));

  // Validate security: No secrets or channel references in instructions
  const stringified = JSON.stringify(instructions);
  if (stringified.includes('FINCRA_SECRET') || stringified.includes('fcb907bd-ab39-4361-bc9b-4f5e94e400c2')) {
    throw new Error('SECURITY VIOLATION: Banking instructions leak secret credentials or channel references!');
  }

  if (instructions.account?.bank_name !== 'FIRST BANK' || instructions.account?.bank_code !== 'INCEGHAC' || instructions.account?.number !== '9990000132713') {
    throw new Error(`GHS Banking details mismatch! Received: ${JSON.stringify(instructions.account)}`);
  }

  // 4. Test GHS Card Payment Initialization
  console.log('4. Initializing GHS Card Payment session...');
  const cardSession = await paymentService.initializePayment(
    testUserId,
    'test@notestandard.com',
    50, // 50 GHS
    'GHS',
    {
      channel: 'card',
      method: 'card',
      customerName: 'Test User',
      callbackUrl: 'https://notestandard.com/payment/callback'
    },
    { provider: 'fincra' }
  );

  console.log('✅ GHS Card Payment Output:', JSON.stringify(cardSession, null, 2));

  const validCheckoutUrl = cardSession?.checkoutUrl || cardSession?.url || cardSession?.link;

  if (!cardSession || !cardSession.reference || !validCheckoutUrl) {
    throw new Error('GHS Card payment initialization did not return valid reference and checkout URL!');
  }

  console.log('🎉 BOTH GHS BANK TRANSFER AND CARD PAYMENT INITIALIZED PERFECTLY!');
  console.log(`GHS Card Checkout Live URL: ${validCheckoutUrl}`);
  console.log('✅ GHS Dual-Channel Acceptance Test PASSED cleanly!');
}

runGhsAudit().catch(err => {
  console.error('❌ GHS Audit Failed:', err);
  process.exit(1);
});
