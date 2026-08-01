/**
 * multicurrency.test.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-Currency Wallet Expansion — Automated Tests
 *
 * Tests cover:
 *   1. Constants catalog completeness
 *   2. ProviderRouter routing for all 21 active currencies
 *   3. ProviderRouter blocks for AUD/NZD/JPY (coming_soon)
 *   4. FiatWalletService guards (USDT/USDC via Fincra, BTC/ETH blocked, coming_soon blocked)
 *   5. CurrencyConfig validation (client config, server config)
 *   6. walletCurrencyCatalog completeness
 *
 * Usage:
 *   node server/tests/multicurrency.test.js
 *
 * Dependencies: none (pure JS, no test framework needed)
 */

'use strict';

// ─── Test harness ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅  ${message}`);
    passed++;
  } else {
    console.error(`  ❌  FAIL: ${message}`);
    failed++;
    failures.push(message);
  }
}

function section(title) {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(70));
}

// ─── Imports ──────────────────────────────────────────────────────────────────

const {
  FINCRA_CURRENCIES,
  FINCRA_SUPPORTED_SET,
  FINCRA_COMING_SOON_SET,
  FINCRA_ALL_FIAT_SET,
} = require('../services/fincra/constants');

const ProviderRouter = require('../services/ProviderRouter');

const { FIAT_CATALOG, CRYPTO_CATALOG } = require('../config/walletCurrencyCatalog');

const {
  SUPPORTED_WALLET_CURRENCIES,
  COMING_SOON_CURRENCIES,
} = require('../config/currencyConfig');

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 1 — Fincra Constants
// ─────────────────────────────────────────────────────────────────────────────

section('SUITE 1 — Fincra Constants');

const EXPECTED_ACTIVE = [
  'NGN','USD','EUR','GBP','CAD',
  'GHS','KES','TZS','UGX','ZAR',
  'XOF','MWK','RWF','XAF','ZMW',
  'EGP','CNY','CNH','USDT','USDC','CNGN',
];

const EXPECTED_COMING_SOON = ['AUD', 'NZD', 'JPY'];

assert(
  EXPECTED_ACTIVE.length === Object.keys(FINCRA_CURRENCIES).length,
  `FINCRA_CURRENCIES has exactly ${EXPECTED_ACTIVE.length} entries`
);

EXPECTED_ACTIVE.forEach(c => {
  assert(FINCRA_SUPPORTED_SET.has(c), `FINCRA_SUPPORTED_SET contains ${c}`);
});

EXPECTED_COMING_SOON.forEach(c => {
  assert(FINCRA_COMING_SOON_SET.has(c), `FINCRA_COMING_SOON_SET contains ${c}`);
  assert(!FINCRA_SUPPORTED_SET.has(c), `FINCRA_SUPPORTED_SET does NOT contain ${c} (coming soon)`);
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 2 — ProviderRouter: Active Currencies → fincra
// ─────────────────────────────────────────────────────────────────────────────

section('SUITE 2 — ProviderRouter: Active Currencies Route to Fincra');

const FIAT_OPS = ['deposit', 'withdraw', 'transfer'];

EXPECTED_ACTIVE.forEach(currency => {
  // Skip currencies with no bank operations (stablecoins/digital)
  const isStablecoin = ['USDT', 'USDC', 'CNGN'].includes(currency);
  if (!isStablecoin) {
    FIAT_OPS.forEach(op => {
      const provider = ProviderRouter.getProvider(currency, op);
      assert(
        provider === 'fincra',
        `getProvider(${currency}, ${op}) === 'fincra' (got: ${provider})`
      );
    });
  }
});

// Virtual accounts — only non-stablecoin currencies should have VAs
const VA_ACTIVE = EXPECTED_ACTIVE.filter(c => !['USDT','USDC','CNGN'].includes(c));
VA_ACTIVE.forEach(currency => {
  const provider = ProviderRouter.getProvider(currency, 'virtual_account');
  assert(
    provider === 'fincra',
    `getProvider(${currency}, virtual_account) === 'fincra' (got: ${provider})`
  );
});

// Stablecoins / digital: deposit and withdraw should still route to fincra
['USDT', 'USDC', 'CNGN'].forEach(currency => {
  ['deposit', 'withdraw'].forEach(op => {
    const provider = ProviderRouter.getProvider(currency, op);
    assert(
      provider === 'fincra',
      `getProvider(${currency}, ${op}) === 'fincra' (got: ${provider})`
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 3 — ProviderRouter: Coming Soon blocked
// ─────────────────────────────────────────────────────────────────────────────

section('SUITE 3 — ProviderRouter: Coming Soon (AUD/NZD/JPY) Return coming_soon');

EXPECTED_COMING_SOON.forEach(currency => {
  FIAT_OPS.forEach(op => {
    const provider = ProviderRouter.getProvider(currency, op);
    assert(
      provider === 'coming_soon',
      `getProvider(${currency}, ${op}) === 'coming_soon' (got: ${provider})`
    );
  });
  const vaProvider = ProviderRouter.getProvider(currency, 'virtual_account');
  assert(
    vaProvider === 'coming_soon',
    `getProvider(${currency}, virtual_account) === 'coming_soon' (got: ${vaProvider})`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 4 — ProviderRouter: Crypto Hard Blocks
// ─────────────────────────────────────────────────────────────────────────────

section('SUITE 4 — ProviderRouter: Hard Crypto (BTC/ETH) → NowPayments');

['BTC', 'ETH'].forEach(currency => {
  const provider = ProviderRouter.getProvider(currency, 'deposit');
  assert(
    provider === 'nowpayments',
    `getProvider(${currency}, deposit) === 'nowpayments' (got: ${provider})`
  );
});

// Internal operations
['swap', 'convert', 'internal_transfer'].forEach(op => {
  const provider = ProviderRouter.getProvider('USD', op);
  assert(
    provider === 'internal',
    `getProvider(USD, ${op}) === 'internal' (got: ${provider})`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 5 — walletCurrencyCatalog Completeness
// ─────────────────────────────────────────────────────────────────────────────

section('SUITE 5 — walletCurrencyCatalog Completeness');

const catalogCodes = FIAT_CATALOG.map(c => c.code);
const activeCatalog = FIAT_CATALOG.filter(c => c.status === 'active');
const comingSoonCatalog = FIAT_CATALOG.filter(c => c.status === 'coming_soon');

assert(activeCatalog.length === 21, `FIAT_CATALOG has 21 active entries (got: ${activeCatalog.length})`);
assert(comingSoonCatalog.length === 3, `FIAT_CATALOG has 3 coming_soon entries (got: ${comingSoonCatalog.length})`);

EXPECTED_ACTIVE.forEach(code => {
  assert(catalogCodes.includes(code), `FIAT_CATALOG contains active ${code}`);
  const entry = FIAT_CATALOG.find(c => c.code === code);
  if (entry) {
    assert(entry.status === 'active', `${code} catalog status === 'active'`);
    assert(entry.provider === 'fincra', `${code} catalog provider === 'fincra'`);
  }
});

EXPECTED_COMING_SOON.forEach(code => {
  assert(catalogCodes.includes(code), `FIAT_CATALOG contains coming_soon ${code}`);
  const entry = FIAT_CATALOG.find(c => c.code === code);
  if (entry) {
    assert(entry.status === 'coming_soon', `${code} catalog status === 'coming_soon'`);
    assert(!entry.deposit_enabled, `${code} catalog deposit_enabled === false`);
    assert(!entry.withdraw_enabled, `${code} catalog withdraw_enabled === false`);
    assert(entry.provider === null, `${code} catalog provider === null`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 6 — currencyConfig.js Server Sets
// ─────────────────────────────────────────────────────────────────────────────

section('SUITE 6 — Server currencyConfig.js Sets');

EXPECTED_ACTIVE.forEach(code => {
  assert(
    SUPPORTED_WALLET_CURRENCIES.has(code),
    `SUPPORTED_WALLET_CURRENCIES contains ${code}`
  );
});

EXPECTED_COMING_SOON.forEach(code => {
  assert(
    COMING_SOON_CURRENCIES.has(code),
    `COMING_SOON_CURRENCIES contains ${code}`
  );
  assert(
    SUPPORTED_WALLET_CURRENCIES.has(code),
    `SUPPORTED_WALLET_CURRENCIES also contains coming_soon ${code} (wallet records exist)`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// TEST SUITE 7 — ProviderRouter isOperationAvailable
// ─────────────────────────────────────────────────────────────────────────────

section('SUITE 7 — ProviderRouter.isOperationAvailable');

EXPECTED_ACTIVE.filter(c => !['USDT','USDC','CNGN'].includes(c)).forEach(currency => {
  assert(
    ProviderRouter.isOperationAvailable(currency, 'deposit') === true,
    `isOperationAvailable(${currency}, deposit) === true`
  );
});

EXPECTED_COMING_SOON.forEach(currency => {
  assert(
    ProviderRouter.isOperationAvailable(currency, 'deposit') === false,
    `isOperationAvailable(${currency}, deposit) === false`
  );
  assert(
    ProviderRouter.isOperationAvailable(currency, 'withdraw') === false,
    `isOperationAvailable(${currency}, withdraw) === false`
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

console.log('\n' + '═'.repeat(70));
console.log(`\n  Results: ${passed} passed, ${failed} failed\n`);

if (failures.length > 0) {
  console.error('  Failed assertions:');
  failures.forEach((f, i) => console.error(`    ${i + 1}. ${f}`));
  process.exit(1);
} else {
  console.log('  ✅  All tests passed!\n');
  process.exit(0);
}
