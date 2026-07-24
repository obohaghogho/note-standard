/**
 * enterpriseMultiCurrencyAUD_CAD_NZD.test.js
 * ============================================
 * Enterprise Multi-Currency Expansion (v3.0 Architecture Audit Test Suite)
 * Tests AUD, CAD, and NZD across:
 *   1. Centralized Currency Registries & Metadata
 *   2. Country Default Mappings (AU, CA, NZ)
 *   3. Declarative Provider Capability Matrices
 *   4. Versioned v1.0 FXQuoteEngine & Structured QuoteExpiredError
 *   5. Decoupled SettlementPolicyEngine
 *   6. Data-Driven GatewayRouter Scoring
 *   7. FraudRiskEngine Rate Conversion & Limits
 *   8. Zero-Regression for NGN, USD, EUR, GBP, JPY
 */

const assert = require('assert');
const test = require('node:test');

const {
  SUPPORTED_APP_CURRENCIES,
  COUNTRY_CURRENCY_DEFAULTS,
  getDefaultCurrencyForCountry,
  isSupportedFiatCurrency,
} = require('../config/paymentCurrencies');

const { getMetadata } = require('../config/currencyMetadata');

const {
  SUPPORTED_WALLET_CURRENCIES,
  SUPPORTED_BANK_ACCOUNT_CURRENCIES,
  isSupportedWalletCurrency,
} = require('../config/currencyConfig');

const {
  PAYMENT_PROVIDER_CAPABILITIES,
  supportsCurrency,
  supportsFallbackCurrency,
} = require('../config/providerCapabilities');

const SettlementPolicyEngine = require('../services/payment/SettlementPolicyEngine');
const GatewayRouter = require('../services/payment/GatewayRouter');
const FraudRiskEngine = require('../services/risk/FraudRiskEngine');
const { QuoteExpiredError, UnsupportedCurrencyError } = require('../utils/PaymentErrors');

test('1. Centralized Currency Registries include AUD, CAD, NZD', () => {
  const currencies = ['NGN', 'USD', 'EUR', 'GBP', 'JPY', 'AUD', 'CAD', 'NZD'];
  for (const curr of currencies) {
    assert.strictEqual(SUPPORTED_APP_CURRENCIES.includes(curr), true, `App currency ${curr} should be supported`);
    assert.strictEqual(SUPPORTED_WALLET_CURRENCIES.has(curr), true, `Wallet currency ${curr} should be supported`);
    assert.strictEqual(SUPPORTED_BANK_ACCOUNT_CURRENCIES.has(curr), true, `Bank currency ${curr} should be supported`);
    assert.strictEqual(isSupportedFiatCurrency(curr), true, `isSupportedFiatCurrency(${curr}) should be true`);
    assert.strictEqual(isSupportedWalletCurrency(curr), true, `isSupportedWalletCurrency(${curr}) should be true`);
  }
});

test('2. Country Default Mappings for Australia, Canada, New Zealand', () => {
  assert.strictEqual(getDefaultCurrencyForCountry('AU'), 'AUD');
  assert.strictEqual(getDefaultCurrencyForCountry('CA'), 'CAD');
  assert.strictEqual(getDefaultCurrencyForCountry('NZ'), 'NZD');
  assert.strictEqual(getDefaultCurrencyForCountry('NG'), 'NGN');
  assert.strictEqual(getDefaultCurrencyForCountry('US'), 'USD');
  assert.strictEqual(getDefaultCurrencyForCountry('GB'), 'GBP');
  assert.strictEqual(getDefaultCurrencyForCountry('JP'), 'JPY');
  assert.strictEqual(getDefaultCurrencyForCountry('XX'), 'USD'); // Fallback
});

test('3. Currency Metadata Decimals and Symbols', () => {
  const audMeta = getMetadata('AUD');
  assert.strictEqual(audMeta.symbol, 'A$');
  assert.strictEqual(audMeta.decimals, 2);
  assert.strictEqual(audMeta.smallestUnitMultiplier, 100);

  const cadMeta = getMetadata('CAD');
  assert.strictEqual(cadMeta.symbol, 'C$');
  assert.strictEqual(cadMeta.decimals, 2);

  const nzdMeta = getMetadata('NZD');
  assert.strictEqual(nzdMeta.symbol, 'NZ$');
  assert.strictEqual(nzdMeta.decimals, 2);

  // Preserve JPY 0 decimal precision
  const jpyMeta = getMetadata('JPY');
  assert.strictEqual(jpyMeta.symbol, '¥');
  assert.strictEqual(jpyMeta.decimals, 0);
  assert.strictEqual(jpyMeta.smallestUnitMultiplier, 1);
});

test('4. Provider Capability Matrices & Fallbacks', () => {
  // Paystack native vs fallback
  assert.strictEqual(supportsCurrency('paystack', 'NGN'), true);
  assert.strictEqual(supportsCurrency('paystack', 'USD'), true);
  assert.strictEqual(supportsFallbackCurrency('paystack', 'AUD'), true);
  assert.strictEqual(supportsFallbackCurrency('paystack', 'CAD'), true);
  assert.strictEqual(supportsFallbackCurrency('paystack', 'NZD'), true);

  // Fincra native vs fallback
  assert.strictEqual(supportsCurrency('fincra', 'EUR'), true);
  assert.strictEqual(supportsCurrency('fincra', 'GBP'), true);
  assert.strictEqual(supportsFallbackCurrency('fincra', 'AUD'), true);
  assert.strictEqual(supportsFallbackCurrency('fincra', 'CAD'), true);
});

test('5. Decoupled SettlementPolicyEngine Resolution', () => {
  assert.strictEqual(SettlementPolicyEngine.resolveSettlementCurrency('USD'), 'USD');
  assert.strictEqual(SettlementPolicyEngine.resolveSettlementCurrency('AUD'), 'USD');
  assert.strictEqual(SettlementPolicyEngine.resolveSettlementCurrency('CAD'), 'USD');
  assert.strictEqual(SettlementPolicyEngine.resolveSettlementCurrency('NZD'), 'USD');
  assert.strictEqual(SettlementPolicyEngine.resolveSettlementCurrency('AUD', { merchantOverride: 'NGN' }), 'NGN');
});

test('6. Data-Driven GatewayRouter Selection', () => {
  const audRoute = GatewayRouter.selectBestGateway({ currency: 'AUD', method: 'card' });
  assert.strictEqual(Boolean(audRoute.adapter), true);
  assert.strictEqual(Boolean(audRoute.providerName), true);

  const cadRoute = GatewayRouter.selectBestGateway({ currency: 'CAD', method: 'card' });
  assert.strictEqual(Boolean(cadRoute.adapter), true);

  const nzdRoute = GatewayRouter.selectBestGateway({ currency: 'NZD', method: 'card' });
  assert.strictEqual(Boolean(nzdRoute.adapter), true);
});

test('7. FraudRiskEngine Approximate Rate Evaluation', () => {
  assert.strictEqual(FraudRiskEngine._approxUsdAmount(100, 'USD'), 100);
  assert.strictEqual(FraudRiskEngine._approxUsdAmount(100, 'AUD'), 66);
  assert.strictEqual(FraudRiskEngine._approxUsdAmount(100, 'CAD'), 73);
  assert.strictEqual(FraudRiskEngine._approxUsdAmount(100, 'NZD'), 60);
});

test('8. Structured Error Hierarchy', () => {
  const expiredErr = new QuoteExpiredError('Quote expired test', { quoteId: 'fxq_123' });
  assert.strictEqual(expiredErr.errorCode, 'QUOTE_EXPIRED');
  assert.strictEqual(expiredErr.statusCode, 409);
  assert.strictEqual(expiredErr.details.quoteId, 'fxq_123');
});
