/**
 * Wallet Hub — Production Readiness Test Suite
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for: ProviderRouter, walletCurrencyCatalog, hub API endpoints,
 * currency completeness, and data integrity.
 *
 * Run with: node server/tests/walletHub.test.js
 */

'use strict';

const assert = require('assert');
const fs     = require('fs');
const path   = require('path');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌  ${name}`);
    console.log(`      → ${err.message}`);
    failed++;
    failures.push({ name, error: err.message });
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. walletCurrencyCatalog Tests
// ─────────────────────────────────────────────────────────────────────────────
section('walletCurrencyCatalog — Currency Completeness');

const catalog = require('../config/walletCurrencyCatalog');

const REQUIRED_FIAT   = ['NGN', 'USD', 'EUR', 'GBP', 'CAD', 'AUD'];
const REQUIRED_CRYPTO = ['BTC', 'ETH', 'USDT', 'USDC'];

test('FIAT_CATALOG contains all 6 required currencies', () => {
  const codes = catalog.FIAT_CATALOG.map(c => c.code);
  for (const req of REQUIRED_FIAT) {
    assert.ok(codes.includes(req), `Missing fiat currency: ${req}`);
  }
});

test('CRYPTO_CATALOG contains all 4 required currencies', () => {
  const codes = catalog.CRYPTO_CATALOG.map(c => c.code);
  for (const req of REQUIRED_CRYPTO) {
    assert.ok(codes.includes(req), `Missing crypto currency: ${req}`);
  }
});

test('NGN is status=active with deposit/withdraw enabled', () => {
  const ngn = catalog.FIAT_CATALOG.find(c => c.code === 'NGN');
  assert.ok(ngn, 'NGN not found');
  assert.strictEqual(ngn.status, 'active');
  assert.strictEqual(ngn.deposit_enabled, true);
  assert.strictEqual(ngn.withdraw_enabled, true);
});

test('USD/EUR/GBP/CAD/AUD are status=coming_soon when INTERNATIONAL_FIAT_ENABLED is false', () => {
  // In test env, INTERNATIONAL_FIAT_ENABLED is not set → should be coming_soon
  if (process.env.INTERNATIONAL_FIAT_ENABLED !== 'true') {
    for (const code of ['USD', 'EUR', 'GBP', 'CAD', 'AUD']) {
      const cur = catalog.FIAT_CATALOG.find(c => c.code === code);
      assert.ok(cur, `${code} not found`);
      assert.strictEqual(cur.status, 'coming_soon', `${code} should be coming_soon`);
      assert.strictEqual(cur.deposit_enabled, false, `${code} deposit should be disabled`);
    }
  }
});

test('All crypto currencies are status=active', () => {
  for (const code of REQUIRED_CRYPTO) {
    const cur = catalog.CRYPTO_CATALOG.find(c => c.code === code);
    assert.ok(cur, `${code} not found`);
    assert.strictEqual(cur.status, 'active', `${code} should be active`);
  }
});

test('Every crypto currency has at least one network', () => {
  for (const cur of catalog.CRYPTO_CATALOG) {
    assert.ok(Array.isArray(cur.networks) && cur.networks.length > 0,
      `${cur.code} has no networks defined`);
  }
});

test('Every currency has required fields: code, name, symbol, flag, color, decimal_places', () => {
  const REQUIRED_FIELDS = ['code', 'name', 'symbol', 'flag', 'color', 'decimal_places'];
  for (const cur of [...catalog.FIAT_CATALOG, ...catalog.CRYPTO_CATALOG]) {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(cur[field] !== undefined && cur[field] !== null && cur[field] !== '',
        `${cur.code} missing field: ${field}`);
    }
  }
});

test('BTC has 8 decimal places, ETH has 6', () => {
  const btc = catalog.CRYPTO_CATALOG.find(c => c.code === 'BTC');
  const eth = catalog.CRYPTO_CATALOG.find(c => c.code === 'ETH');
  assert.strictEqual(btc.decimal_places, 8, 'BTC should have 8 decimal places');
  assert.strictEqual(eth.decimal_places, 6, 'ETH should have 6 decimal places');
});

test('getAllCurrencies() returns all 10 currencies', () => {
  const all = catalog.getAllCurrencies();
  assert.strictEqual(all.length, 10, `Expected 10 currencies, got ${all.length}`);
});

test('getCatalogEntry() works for all 8 currencies', () => {
  for (const code of [...REQUIRED_FIAT, ...REQUIRED_CRYPTO]) {
    const entry = catalog.getCatalogEntry(code);
    assert.ok(entry, `getCatalogEntry(${code}) returned null`);
    assert.strictEqual(entry.code, code);
  }
  assert.strictEqual(catalog.getCatalogEntry('INVALID'), null);
});

test('catalogSupports() respects status=coming_soon', () => {
  if (process.env.INTERNATIONAL_FIAT_ENABLED !== 'true') {
    assert.strictEqual(catalog.catalogSupports('USD', 'deposit_enabled'), false,
      'USD deposit should not be supported when coming_soon');
  }
  assert.strictEqual(catalog.catalogSupports('NGN', 'deposit_enabled'), true,
    'NGN deposit should be supported');
  assert.strictEqual(catalog.catalogSupports('BTC', 'swap_enabled'), true,
    'BTC swap should be supported');
  assert.strictEqual(catalog.catalogSupports('INVALID', 'deposit_enabled'), false,
    'Invalid currency should return false');
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. ProviderRouter Tests
// ─────────────────────────────────────────────────────────────────────────────
section('ProviderRouter — Routing Logic');

const router = require('../services/ProviderRouter');

test('NGN deposit/withdraw routes to paystack', () => {
  assert.strictEqual(router.getProvider('NGN', 'deposit'),  'paystack');
  assert.strictEqual(router.getProvider('NGN', 'withdraw'), 'paystack');
  assert.strictEqual(router.getProvider('NGN', 'transfer'), 'paystack');
});

test('USD/EUR/GBP route to coming_soon when INTERNATIONAL_FIAT_ENABLED is false', () => {
  if (process.env.INTERNATIONAL_FIAT_ENABLED !== 'true') {
    for (const code of ['USD', 'EUR', 'GBP']) {
      const provider = router.getProvider(code, 'deposit');
      assert.strictEqual(provider, 'coming_soon',
        `${code} deposit should route to coming_soon, got: ${provider}`);
    }
  }
});

test('BTC routes to nowpayments for deposit/withdraw/buy/sell', () => {
  for (const op of ['deposit', 'withdraw', 'buy', 'sell']) {
    assert.strictEqual(router.getProvider('BTC', op), 'nowpayments',
      `BTC ${op} should route to nowpayments`);
  }
});

test('ETH routes to nowpayments', () => {
  assert.strictEqual(router.getProvider('ETH', 'deposit'), 'nowpayments');
  assert.strictEqual(router.getProvider('ETH', 'buy'),     'nowpayments');
});

test('USDT routes to nowpayments', () => {
  assert.strictEqual(router.getProvider('USDT', 'deposit'), 'nowpayments');
  assert.strictEqual(router.getProvider('USDT', 'sell'),    'nowpayments');
});

test('USDC routes to nowpayments', () => {
  assert.strictEqual(router.getProvider('USDC', 'deposit'), 'nowpayments');
  assert.strictEqual(router.getProvider('USDC', 'withdraw'),'nowpayments');
});

test('Swap and convert operations route to internal', () => {
  assert.strictEqual(router.getProvider('BTC',  'swap'),    'internal');
  assert.strictEqual(router.getProvider('NGN',  'convert'), 'internal');
  assert.strictEqual(router.getProvider('ETH',  'convert'), 'internal');
  assert.strictEqual(router.getProvider('USDT', 'swap'),    'internal');
});

test('isOperationAvailable() returns true for NGN deposit', () => {
  assert.strictEqual(router.isOperationAvailable('NGN', 'deposit'), true);
});

test('isOperationAvailable() returns false for USD deposit when intl disabled', () => {
  if (process.env.INTERNATIONAL_FIAT_ENABLED !== 'true') {
    assert.strictEqual(router.isOperationAvailable('USD', 'deposit'), false);
  }
});

test('isOperationAvailable() returns true for all crypto operations', () => {
  for (const code of REQUIRED_CRYPTO) {
    assert.strictEqual(router.isOperationAvailable(code, 'deposit'),  true, `${code} deposit`);
    assert.strictEqual(router.isOperationAvailable(code, 'withdraw'), true, `${code} withdraw`);
    assert.strictEqual(router.isOperationAvailable(code, 'buy'),      true, `${code} buy`);
    assert.strictEqual(router.isOperationAvailable(code, 'sell'),     true, `${code} sell`);
  }
});

test('getRoutingTable() returns a table with all 8 currencies', () => {
  const table = router.getRoutingTable();
  for (const code of [...REQUIRED_FIAT, ...REQUIRED_CRYPTO]) {
    assert.ok(table[code], `${code} not in routing table`);
  }
});

test('getLiveProviders() includes paystack, nowpayments, internal', () => {
  const live = router.getLiveProviders();
  assert.ok(live.includes('paystack'),    'paystack should be live');
  assert.ok(live.includes('nowpayments'), 'nowpayments should be live');
  assert.ok(live.includes('internal'),    'internal should be live');
});

test('isCrypto() correctly classifies all currencies', () => {
  for (const code of REQUIRED_CRYPTO) {
    assert.strictEqual(router.isCrypto(code), true,  `${code} should be crypto`);
  }
  for (const code of REQUIRED_FIAT) {
    assert.strictEqual(router.isCrypto(code), false, `${code} should not be crypto`);
  }
});

test('isFiat() correctly classifies all currencies', () => {
  for (const code of REQUIRED_FIAT) {
    assert.strictEqual(router.isFiat(code), true,  `${code} should be fiat`);
  }
  for (const code of REQUIRED_CRYPTO) {
    assert.strictEqual(router.isFiat(code), false, `${code} should not be fiat`);
  }
});

test('Case-insensitive routing (lowercase input)', () => {
  assert.strictEqual(router.getProvider('ngn', 'deposit'), 'paystack');
  assert.strictEqual(router.getProvider('btc', 'deposit'), 'nowpayments');
  assert.strictEqual(router.getProvider('usdt', 'swap'),   'internal');
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Currency Catalog — Business Logic Validation
// ─────────────────────────────────────────────────────────────────────────────
section('Currency Catalog — Business Logic Validation');

test('All fiat currencies have deposit_methods defined', () => {
  for (const cur of catalog.FIAT_CATALOG) {
    if (cur.status === 'active') {
      assert.ok(Array.isArray(cur.deposit_methods) && cur.deposit_methods.length > 0,
        `${cur.code} active fiat currency missing deposit_methods`);
    }
  }
});

test('NGN minimum deposit is ≥ 100 (Paystack minimum)', () => {
  const ngn = catalog.FIAT_CATALOG.find(c => c.code === 'NGN');
  assert.ok(ngn.minimum_deposit >= 100, `NGN minimum deposit too low: ${ngn.minimum_deposit}`);
});

test('BTC minimum deposit reflects on-chain dust limit', () => {
  const btc = catalog.CRYPTO_CATALOG.find(c => c.code === 'BTC');
  assert.ok(btc.minimum_deposit > 0 && btc.minimum_deposit < 0.001,
    `BTC minimum deposit suspicious: ${btc.minimum_deposit}`);
});

test('All crypto currencies have provider=nowpayments', () => {
  for (const cur of catalog.CRYPTO_CATALOG) {
    assert.strictEqual(cur.provider, 'nowpayments',
      `${cur.code} should use nowpayments, got: ${cur.provider}`);
  }
});

test('NGN has provider=paystack', () => {
  const ngn = catalog.FIAT_CATALOG.find(c => c.code === 'NGN');
  assert.strictEqual(ngn.provider, 'paystack');
});

test('International fiats have provider=fincra', () => {
  for (const code of ['USD', 'EUR', 'GBP', 'CAD', 'AUD']) {
    const cur = catalog.FIAT_CATALOG.find(c => c.code === code);
    assert.strictEqual(cur.provider, 'fincra',
      `${code} should use fincra`);
  }
});

test('Fiat currencies do NOT have swap_enabled=true', () => {
  for (const cur of catalog.FIAT_CATALOG) {
    assert.strictEqual(cur.swap_enabled, false,
      `${cur.code} fiat should not have swap enabled`);
  }
});

test('Crypto currencies do NOT have transfer_enabled=true (P2P)', () => {
  for (const cur of catalog.CRYPTO_CATALOG) {
    assert.strictEqual(cur.transfer_enabled, false,
      `${cur.code} crypto should not have P2P transfer enabled`);
  }
});

test('USDT has TRC20 network support', () => {
  const usdt = catalog.CRYPTO_CATALOG.find(c => c.code === 'USDT');
  assert.ok(usdt.networks.includes('TRC20'), 'USDT should support TRC20');
});

test('USDC has polygon network support', () => {
  const usdc = catalog.CRYPTO_CATALOG.find(c => c.code === 'USDC');
  assert.ok(usdc.networks.includes('polygon'), 'USDC should support polygon');
});

test('BTC has bitcoin network support', () => {
  const btc = catalog.CRYPTO_CATALOG.find(c => c.code === 'BTC');
  assert.ok(btc.networks.includes('bitcoin'), 'BTC should support bitcoin network');
});

test('Display orders are unique within each catalog', () => {
  const fiatOrders = catalog.FIAT_CATALOG.map(c => c.display_order);
  assert.strictEqual(new Set(fiatOrders).size, fiatOrders.length,
    'Fiat display_orders must be unique');
  const cryptoOrders = catalog.CRYPTO_CATALOG.map(c => c.display_order);
  assert.strictEqual(new Set(cryptoOrders).size, cryptoOrders.length,
    'Crypto display_orders must be unique');
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Provider Registry Integrity
// ─────────────────────────────────────────────────────────────────────────────
section('Provider Registry — Integrity');

test('PROVIDER_REGISTRY has all required providers', () => {
  const required = ['paystack', 'paystack_international', 'nowpayments', 'internal', 'grey', 'fincra'];
  for (const p of required) {
    assert.ok(router.PROVIDER_REGISTRY[p], `Missing provider: ${p}`);
  }
});

test('Live providers all have required fields', () => {
  for (const [name, info] of Object.entries(router.PROVIDER_REGISTRY)) {
    assert.ok(Array.isArray(info.supportedCurrencies), `${name}: missing supportedCurrencies`);
    assert.ok(Array.isArray(info.operations), `${name}: missing operations`);
    assert.ok(typeof info.live === 'boolean', `${name}: missing live flag`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 4b. Gap Fixes — Auditor-Found Issues (now all resolved)
// ─────────────────────────────────────────────────────────────────────────────
section('Gap Fixes — Auditor-Found Issues');

const providerCaps = require('../config/providerCapabilities');
const currencyConf = require('../config/currencyConfig');

test('providerCapabilities: Paystack supportedCurrencies includes EUR and GBP', () => {
  const paystackCaps = providerCaps.PAYMENT_PROVIDER_CAPABILITIES.paystack;
  assert.ok(paystackCaps.supportedCurrencies.includes('EUR'),
    'EUR missing from Paystack supportedCurrencies — isPaystackNative() would fail for EUR');
  assert.ok(paystackCaps.supportedCurrencies.includes('GBP'),
    'GBP missing from Paystack supportedCurrencies — isPaystackNative() would fail for GBP');
});

test('providerCapabilities: Paystack settlementCurrencies includes EUR and GBP', () => {
  const paystackCaps = providerCaps.PAYMENT_PROVIDER_CAPABILITIES.paystack;
  assert.ok(paystackCaps.settlementCurrencies.includes('EUR'),
    'EUR missing from Paystack settlementCurrencies');
  assert.ok(paystackCaps.settlementCurrencies.includes('GBP'),
    'GBP missing from Paystack settlementCurrencies');
});

test('currencyConfig: PAYSTACK_NATIVE_CURRENCIES legacy set includes EUR and GBP', () => {
  assert.ok(currencyConf.PAYSTACK_NATIVE_CURRENCIES.has('EUR'),
    'EUR missing from PAYSTACK_NATIVE_CURRENCIES — legacy consumers would reject EUR');
  assert.ok(currencyConf.PAYSTACK_NATIVE_CURRENCIES.has('GBP'),
    'GBP missing from PAYSTACK_NATIVE_CURRENCIES — legacy consumers would reject GBP');
  assert.ok(currencyConf.PAYSTACK_NATIVE_CURRENCIES.has('NGN'),
    'NGN missing from PAYSTACK_NATIVE_CURRENCIES');
  assert.ok(currencyConf.PAYSTACK_NATIVE_CURRENCIES.has('USD'),
    'USD missing from PAYSTACK_NATIVE_CURRENCIES');
});

test('fxService SEEDS: covers all 8 wallet currencies (no cold-cache zero-rate risk)', () => {
  // We verify by reading fxService.js directly — we can't instantiate it without DB
  const fxSrc = fs.readFileSync(
    path.join(__dirname, '../services/fxService.js'), 'utf8'
  );
  // All 8 currencies must appear in the SEEDS block
  const requiredInSeeds = ['BTC', 'ETH', 'USDT', 'USDC', 'USD', 'NGN', 'EUR', 'GBP'];
  for (const ticker of requiredInSeeds) {
    assert.ok(fxSrc.includes(`${ticker}:`), `SEEDS missing ticker: ${ticker}`);
  }
});

test('fxService SEEDS: stablecoin pegs are 1.0 (USDT and USDC)', () => {
  const fxSrc = fs.readFileSync(
    path.join(__dirname, '../services/fxService.js'), 'utf8'
  );
  assert.ok(fxSrc.includes('USDT: 1.0') || fxSrc.includes('USDT:1.0'),
    'USDT seed should be 1.0 (stablecoin peg)');
  assert.ok(fxSrc.includes('USDC: 1.0') || fxSrc.includes('USDC:1.0'),
    'USDC seed should be 1.0 (stablecoin peg)');
});


// ─────────────────────────────────────────────────────────────────────────────
// 5. Migration SQL Validation
// ─────────────────────────────────────────────────────────────────────────────
section('Migration SQL — Completeness Check');


test('add_supported_currencies.sql exists', () => {
  const p = path.join(__dirname, '../migrations/add_supported_currencies.sql');
  assert.ok(fs.existsSync(p), 'Migration file not found');
});

test('fix_supported_currencies_add_columns.sql exists', () => {
  const p = path.join(__dirname, '../migrations/fix_supported_currencies_add_columns.sql');
  assert.ok(fs.existsSync(p), 'Fix migration file not found');
});

test('Migration SQL contains all 8 currency INSERT values', () => {
  const fixSql = fs.readFileSync(
    path.join(__dirname, '../migrations/fix_supported_currencies_add_columns.sql'),
    'utf8'
  );
  for (const code of [...REQUIRED_FIAT, ...REQUIRED_CRYPTO]) {
    assert.ok(fixSql.includes(`'${code}'`), `Migration SQL missing INSERT for: ${code}`);
  }
});

test('Migration SQL has RLS policies', () => {
  const fixSql = fs.readFileSync(
    path.join(__dirname, '../migrations/fix_supported_currencies_add_columns.sql'),
    'utf8'
  );
  assert.ok(fixSql.includes('ROW LEVEL SECURITY'), 'Missing RLS enable');
  assert.ok(fixSql.includes('CREATE POLICY'), 'Missing RLS policy');
});

test('Migration SQL has ON CONFLICT DO UPDATE (upsert, not insert-only)', () => {
  const fixSql = fs.readFileSync(
    path.join(__dirname, '../migrations/fix_supported_currencies_add_columns.sql'),
    'utf8'
  );
  assert.ok(fixSql.includes('ON CONFLICT'), 'Missing ON CONFLICT clause');
  assert.ok(fixSql.includes('DO UPDATE'), 'Missing DO UPDATE clause');
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Server Route Registration
// ─────────────────────────────────────────────────────────────────────────────
section('Server Routes — Hub Endpoints Registered');

test('walletRoutes.js exports include /hub route', () => {
  const routeFile = fs.readFileSync(
    path.join(__dirname, '../routes/walletRoutes.js'), 'utf8'
  );
  assert.ok(routeFile.includes('"/hub"') || routeFile.includes("'/hub'"),
    'Missing /hub route');
});

test('walletRoutes.js exports include /portfolio route', () => {
  const routeFile = fs.readFileSync(
    path.join(__dirname, '../routes/walletRoutes.js'), 'utf8'
  );
  assert.ok(routeFile.includes('"/portfolio"') || routeFile.includes("'/portfolio'"),
    'Missing /portfolio route');
});

test('walletRoutes.js exports include /currencies route', () => {
  const routeFile = fs.readFileSync(
    path.join(__dirname, '../routes/walletRoutes.js'), 'utf8'
  );
  assert.ok(routeFile.includes('"/currencies"') || routeFile.includes("'/currencies'"),
    'Missing /currencies route');
});

test('walletRoutes.js exports include /internal-transfer route', () => {
  const routeFile = fs.readFileSync(
    path.join(__dirname, '../routes/walletRoutes.js'), 'utf8'
  );
  assert.ok(routeFile.includes('"/internal-transfer"') || routeFile.includes("'/internal-transfer'"),
    'Missing /internal-transfer route');
});

test('walletController.js exports getHubView', () => {
  const ctrl = fs.readFileSync(
    path.join(__dirname, '../controllers/walletController.js'), 'utf8'
  );
  assert.ok(ctrl.includes('exports.getHubView'), 'Missing exports.getHubView');
});

test('walletController.js exports getCurrencyCatalog', () => {
  const ctrl = fs.readFileSync(
    path.join(__dirname, '../controllers/walletController.js'), 'utf8'
  );
  assert.ok(ctrl.includes('exports.getCurrencyCatalog'), 'Missing exports.getCurrencyCatalog');
});

test('walletController.js exports getPortfolioSummary', () => {
  const ctrl = fs.readFileSync(
    path.join(__dirname, '../controllers/walletController.js'), 'utf8'
  );
  assert.ok(ctrl.includes('exports.getPortfolioSummary'), 'Missing exports.getPortfolioSummary');
});

test('walletController.js exports internalTransfer', () => {
  const ctrl = fs.readFileSync(
    path.join(__dirname, '../controllers/walletController.js'), 'utf8'
  );
  assert.ok(ctrl.includes('exports.internalTransfer'), 'Missing exports.internalTransfer');
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Frontend Files — Key Assertions
// ─────────────────────────────────────────────────────────────────────────────
section('Frontend Files — Existence & Key Exports');

const CLIENT_WALLET = path.join(__dirname, '../../client/src/components/wallet');

const REQUIRED_COMPONENTS = [
  'PortfolioDashboard.tsx',
  'WalletHubTabs.tsx',
  'FiatWalletCard.tsx',
  'CryptoWalletCard.tsx',
  'ExchangeHub.tsx',
  'RecentActivity.tsx',
];

for (const component of REQUIRED_COMPONENTS) {
  test(`Component exists: ${component}`, () => {
    const p = path.join(CLIENT_WALLET, component);
    assert.ok(fs.existsSync(p), `Missing component: ${p}`);
  });
}

test('WalletPage.tsx exists and is non-empty', () => {
  const p = path.join(__dirname, '../../client/src/pages/WalletPage.tsx');
  assert.ok(fs.existsSync(p), 'WalletPage.tsx not found');
  const size = fs.statSync(p).size;
  assert.ok(size > 5000, `WalletPage.tsx too small: ${size} bytes`);
});

test('ExchangeHub uses previewSwapHub (not old positional previewSwap)', () => {
  const hub = fs.readFileSync(path.join(CLIENT_WALLET, 'ExchangeHub.tsx'), 'utf8');
  assert.ok(hub.includes('previewSwapHub'), 'ExchangeHub must use previewSwapHub');
  assert.ok(!hub.includes('walletApi.previewSwap('), 'ExchangeHub must not call previewSwap() directly');
});

test('ExchangeHub uses executeSwapHub (not old positional executeSwap)', () => {
  const hub = fs.readFileSync(path.join(CLIENT_WALLET, 'ExchangeHub.tsx'), 'utf8');
  assert.ok(hub.includes('executeSwapHub'), 'ExchangeHub must use executeSwapHub');
  assert.ok(!hub.includes('walletApi.executeSwap('), 'ExchangeHub must not call executeSwap() directly');
});

test('walletApi.ts has getHubView method', () => {
  const api = fs.readFileSync(
    path.join(__dirname, '../../client/src/api/walletApi.ts'), 'utf8'
  );
  assert.ok(api.includes('getHubView'), 'walletApi missing getHubView');
});

test('walletApi.ts has getCurrencies method', () => {
  const api = fs.readFileSync(
    path.join(__dirname, '../../client/src/api/walletApi.ts'), 'utf8'
  );
  assert.ok(api.includes('getCurrencies'), 'walletApi missing getCurrencies');
});

test('walletApi.ts has getLedger method', () => {
  const api = fs.readFileSync(
    path.join(__dirname, '../../client/src/api/walletApi.ts'), 'utf8'
  );
  assert.ok(api.includes('getLedger'), 'walletApi missing getLedger');
});

test('walletApi.ts has previewSwapHub method', () => {
  const api = fs.readFileSync(
    path.join(__dirname, '../../client/src/api/walletApi.ts'), 'utf8'
  );
  assert.ok(api.includes('previewSwapHub'), 'walletApi missing previewSwapHub');
});

test('walletApi.ts has executeSwapHub method', () => {
  const api = fs.readFileSync(
    path.join(__dirname, '../../client/src/api/walletApi.ts'), 'utf8'
  );
  assert.ok(api.includes('executeSwapHub'), 'walletApi missing executeSwapHub');
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Mobile — Existence & Navigation
// ─────────────────────────────────────────────────────────────────────────────
section('Mobile — Screen & Navigation Checks');

const MOBILE_SCREENS = path.join(__dirname, '../../mobile/src/screens');
const MOBILE_NAV     = path.join(__dirname, '../../mobile/src/navigation');

test('WalletScreen.tsx exists and is non-empty', () => {
  const p = path.join(MOBILE_SCREENS, 'WalletScreen.tsx');
  assert.ok(fs.existsSync(p), 'WalletScreen.tsx not found');
  const size = fs.statSync(p).size;
  assert.ok(size > 8000, `WalletScreen.tsx too small: ${size} bytes (hub version should be larger)`);
});

test('ExchangeScreen.tsx exists', () => {
  const p = path.join(MOBILE_SCREENS, 'ExchangeScreen.tsx');
  assert.ok(fs.existsSync(p), 'ExchangeScreen.tsx not found');
});

test('MainStack.tsx registers Exchange screen', () => {
  const nav = fs.readFileSync(path.join(MOBILE_NAV, 'MainStack.tsx'), 'utf8');
  assert.ok(nav.includes('ExchangeScreen'), 'MainStack does not import ExchangeScreen');
  assert.ok(nav.includes('"Exchange"') || nav.includes("'Exchange'"),
    'MainStack does not register Exchange route');
});

test('MainStack.tsx has correct Exchange param type', () => {
  const nav = fs.readFileSync(path.join(MOBILE_NAV, 'MainStack.tsx'), 'utf8');
  assert.ok(nav.includes('Exchange:'), 'Missing Exchange in param type list');
  assert.ok(nav.includes('mode'), 'Exchange route missing mode param');
});

test('Mobile WalletScreen includes all 4 fiat currencies in DEFAULT_FIAT', () => {
  const screen = fs.readFileSync(path.join(MOBILE_SCREENS, 'WalletScreen.tsx'), 'utf8');
  for (const code of REQUIRED_FIAT) {
    assert.ok(screen.includes(`'${code}'`) || screen.includes(`"${code}"`),
      `Mobile WalletScreen missing fiat currency: ${code}`);
  }
});

test('Mobile WalletScreen includes all 4 crypto currencies in DEFAULT_CRYPTO', () => {
  const screen = fs.readFileSync(path.join(MOBILE_SCREENS, 'WalletScreen.tsx'), 'utf8');
  for (const code of REQUIRED_CRYPTO) {
    assert.ok(screen.includes(`'${code}'`) || screen.includes(`"${code}"`),
      `Mobile WalletScreen missing crypto currency: ${code}`);
  }
});

test('Mobile ExchangeScreen includes all 4 crypto options', () => {
  const screen = fs.readFileSync(path.join(MOBILE_SCREENS, 'ExchangeScreen.tsx'), 'utf8');
  for (const code of REQUIRED_CRYPTO) {
    assert.ok(screen.includes(`'${code}'`) || screen.includes(`"${code}"`),
      `Mobile ExchangeScreen missing crypto: ${code}`);
  }
});

test('ProviderRouter.js exists and is non-empty', () => {
  const p = path.join(__dirname, '../services/ProviderRouter.js');
  assert.ok(fs.existsSync(p), 'ProviderRouter.js not found');
  assert.ok(fs.statSync(p).size > 3000, 'ProviderRouter.js suspiciously small');
});

// ─────────────────────────────────────────────────────────────────────────────
// Virtual Account System Tests
// ─────────────────────────────────────────────────────────────────────────────
section('Virtual Account Funding System — Unit Verification');

test('VirtualAccountService.js module exists', () => {
  const p = path.join(__dirname, '../services/VirtualAccountService.js');
  assert.ok(fs.existsSync(p), 'VirtualAccountService.js not found');
});

test('ProviderRouter returns correct default virtual account providers', () => {
  // NGN virtual account should route to paystack (or custom config if set)
  const ngnProvider = router.getProvider('NGN', 'virtual_account');
  assert.strictEqual(ngnProvider, process.env.NGN_VIRTUAL_ACCOUNT_PROVIDER || 'paystack');

  // If international fiat is disabled, USD/EUR/GBP/CAD/AUD should route to coming_soon
  if (process.env.INTERNATIONAL_FIAT_ENABLED !== 'true') {
    for (const code of ['USD', 'EUR', 'GBP', 'CAD', 'AUD']) {
      assert.strictEqual(router.getProvider(code, 'virtual_account'), 'coming_soon', `${code} should be coming_soon when intl VA disabled`);
    }
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// RESULTS
// ─────────────────────────────────────────────────────────────────────────────
const total = passed + failed;
console.log('\n' + '═'.repeat(60));
console.log(`  RESULTS: ${passed}/${total} passed`);

if (failed > 0) {
  console.log(`\n  ❌ FAILED TESTS (${failed}):`);
  failures.forEach((f, i) => {
    console.log(`\n  ${i + 1}. ${f.name}`);
    console.log(`     ${f.error}`);
  });
  console.log('');
  process.exit(1);
} else {
  console.log('  🚀 ALL TESTS PASSED — PRODUCTION READY');
  console.log('═'.repeat(60) + '\n');
  process.exit(0);
}
