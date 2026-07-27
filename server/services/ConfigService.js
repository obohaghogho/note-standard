/**
 * ConfigService.js
 * ================
 * Centralised credential & configuration injector.
 * Adapters never read process.env directly — all config is accessed here.
 * Enables key rotation, testing overrides, and future vault integration.
 *
 * NoteStandard Financial Platform v4
 */

const logger = require('../utils/logger');

/**
 * In-memory override store (used for testing / hot-rotation without restart).
 * @type {Map<string, string>}
 */
const _overrides = new Map();

/**
 * All config keys with their environment variable names and optional defaults.
 */
const CONFIG_SCHEMA = {
  // Business
  BUSINESS_LEDGER_CURRENCY:    { env: 'BUSINESS_LEDGER_CURRENCY',    default: 'USD' },
  NODE_ENV:                    { env: 'NODE_ENV',                     default: 'development' },

  // Paystack
  PAYSTACK_SECRET_KEY:         { env: 'PAYSTACK_SECRET_KEY',          default: null },
  PAYSTACK_PUBLIC_KEY:         { env: 'PAYSTACK_PUBLIC_KEY',          default: null },
  PAYSTACK_WEBHOOK_SECRET:     { env: 'PAYSTACK_WEBHOOK_SECRET',      default: null },

  // Fincra
  FINCRA_API_KEY:              { env: 'FINCRA_API_KEY',               default: null },
  FINCRA_BUSINESS_ID:          { env: 'FINCRA_BUSINESS_ID',           default: null },
  FINCRA_WEBHOOK_SECRET:       { env: 'FINCRA_WEBHOOK_SECRET',        default: null },
  FINCRA_BASE_URL:             { env: 'FINCRA_BASE_URL',              default: 'https://sandboxapi.fincra.com' },
  FINCRA_GATEWAY_URL:          { env: 'FINCRA_GATEWAY_URL',           default: null },
  FINCRA_GATEWAY_KEY:          { env: 'FINCRA_GATEWAY_KEY',           default: null },

  // Grey
  GREY_API_KEY:                { env: 'GREY_API_KEY',                 default: null },
  GREY_WEBHOOK_SECRET:         { env: 'GREY_WEBHOOK_SECRET',          default: null },
  GREY_BASE_URL:               { env: 'GREY_BASE_URL',                default: 'https://api.grey.co' },

  // Anchor
  ANCHOR_API_KEY:              { env: 'ANCHOR_API_KEY',               default: null },
  ANCHOR_WEBHOOK_SECRET:       { env: 'ANCHOR_WEBHOOK_SECRET',        default: null },
  ANCHOR_BASE_URL:             { env: 'ANCHOR_BASE_URL',              default: 'https://sandbox.api.getanchor.co' },

  // NowPayments
  NOWPAYMENTS_API_KEY:         { env: 'NOWPAYMENTS_API_KEY',          default: null },
  NOWPAYMENTS_WEBHOOK_SECRET:  { env: 'NOWPAYMENTS_IPN_SECRET_KEY',   default: null },

  // FX
  EXCHANGE_RATE_API_KEY:       { env: 'EXCHANGE_RATE_API_KEY',        default: null },
  FX_CACHE_TTL_SECONDS:        { env: 'FX_CACHE_TTL_SECONDS',         default: '600' },
  FX_QUOTE_TTL_SECONDS:        { env: 'FX_QUOTE_TTL_SECONDS',         default: '300' },

  // Risk
  MAX_TRANSACTION_USD:         { env: 'MAX_TRANSACTION_USD',          default: '50000' },
  RISK_BLOCK_HIGH_RISK_COUNTRIES: { env: 'RISK_BLOCK_HIGH_RISK_COUNTRIES', default: 'false' },

  // Supabase
  SUPABASE_URL:                { env: 'SUPABASE_URL',                 default: null },
  SUPABASE_SERVICE_KEY:        { env: 'SUPABASE_SERVICE_KEY',         default: null },
};

/**
 * Retrieves a config value by key.
 * Precedence: overrides → process.env → schema default
 * @param {string} key
 * @returns {string | null}
 */
function get(key) {
  if (_overrides.has(key)) return _overrides.get(key);
  const schema = CONFIG_SCHEMA[key];
  if (!schema) {
    logger.warn(`[ConfigService] Unknown config key: ${key}`);
    return process.env[key] ?? null;
  }
  return process.env[schema.env] ?? schema.default ?? null;
}

/**
 * Returns a required config value. Throws if missing.
 * @param {string} key
 * @returns {string}
 */
function require_(key) {
  const value = get(key);
  if (value === null || value === undefined || value === '') {
    throw new Error(`[ConfigService] Required config key missing: ${key}`);
  }
  return value;
}

/**
 * Overrides a config value at runtime (useful for testing).
 * @param {string} key
 * @param {string} value
 */
function set(key, value) {
  _overrides.set(key, value);
}

/**
 * Clears all runtime overrides.
 */
function clearOverrides() {
  _overrides.clear();
}

/**
 * Returns all provider config for a given provider name.
 */
function getProviderConfig(providerName) {
  const p = String(providerName).toUpperCase();
  const configs = {};
  for (const [key] of Object.entries(CONFIG_SCHEMA)) {
    if (key.startsWith(p + '_')) {
      configs[key] = get(key);
    }
  }
  return configs;
}

module.exports = { get, require: require_, set, clearOverrides, getProviderConfig, CONFIG_SCHEMA };
