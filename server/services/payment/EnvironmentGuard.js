'use strict';
/**
 * EnvironmentGuard.js
 * ===================
 * Prevents sandbox/production environment mixing within a single transaction.
 * Every provider must operate in the same environment for any given request.
 *
 * Rules:
 *   1. All providers in a routing decision must share the same environment.
 *   2. If STRICT_ENV_ISOLATION=true, mixing environments throws immediately.
 *   3. If STRICT_ENV_ISOLATION=false (default), mixing generates a warning only.
 *
 * Environment inference priority:
 *   1. Explicit PROVIDER_ENV env var (e.g. FINCRA_ENV=production)
 *   2. Global ENV / NODE_ENV
 *   3. API key prefix heuristic (e.g. 'test_' = sandbox)
 *
 * @module services/payment/EnvironmentGuard
 */

const logger = require('../../utils/logger');

// Per-provider environment env var names
const ENV_VAR_MAP = {
  fincra:      'FINCRA_ENV',
  anchor:      'ANCHOR_ENV',
  paystack:    'PAYSTACK_ENV',
  grey:        'GREY_ENV',
  nowpayments: 'NOWPAYMENTS_ENV',
};

// API key env var names (used for heuristic detection)
const API_KEY_MAP = {
  fincra:      'FINCRA_API_KEY',
  anchor:      'ANCHOR_API_KEY',
  paystack:    'PAYSTACK_SECRET_KEY',
  grey:        'GREY_API_KEY',
  nowpayments: 'NOWPAYMENTS_API_KEY',
};

// Sandbox key prefix patterns
const SANDBOX_PREFIXES = ['test_', 'sandbox_', 'sk_test', 'pk_test'];

const EnvironmentGuard = {
  /**
   * Detect the environment for a provider.
   * @param {string} providerName
   * @returns {'production' | 'sandbox' | 'unknown'}
   */
  getEnvironment(providerName) {
    const name = String(providerName).toLowerCase();

    // 1. Explicit provider env var
    const envVar = ENV_VAR_MAP[name];
    if (envVar) {
      const val = (process.env[envVar] || '').toLowerCase().trim();
      if (val === 'live' || val === 'production') return 'production';
      if (val === 'sandbox' || val === 'test')    return 'sandbox';
    }

    // 2. Global NODE_ENV
    const nodeEnv = (process.env.NODE_ENV || '').toLowerCase();
    if (nodeEnv === 'production') {
      // Still check key heuristic to catch accidental test keys in prod
    }

    // 3. API key heuristic
    const keyVar = API_KEY_MAP[name];
    if (keyVar) {
      const key = (process.env[keyVar] || '').toLowerCase();
      if (SANDBOX_PREFIXES.some(prefix => key.startsWith(prefix))) return 'sandbox';
      if (key.length > 0) return 'production'; // Non-test key → assume production
    }

    return 'unknown';
  },

  /**
   * Get environments for a list of providers.
   * @param {string[]} providerNames
   * @returns {Object} { providerName: 'production'|'sandbox'|'unknown' }
   */
  getEnvironments(providerNames) {
    const result = {};
    for (const name of providerNames) {
      result[name] = this.getEnvironment(name);
    }
    return result;
  },

  /**
   * Assert that all given providers are in the same environment.
   * Throws (if strict) or warns on environment mixing.
   *
   * @param {string[]} providerNames
   * @param {string}   [correlationId]  For audit trail
   * @returns {{ safe: boolean, environments: Object, mixingDetected: boolean }}
   */
  assertUniform(providerNames, correlationId = '') {
    const envs        = this.getEnvironments(providerNames);
    const envValues   = Object.values(envs).filter(v => v !== 'unknown');
    const unique      = [...new Set(envValues)];
    const mixing      = unique.length > 1;

    if (mixing) {
      const details = Object.entries(envs).map(([p, e]) => `${p}=${e}`).join(', ');
      const msg     = `[EnvironmentGuard] Environment mixing detected [${correlationId}]: ${details}`;

      if (process.env.STRICT_ENV_ISOLATION === 'true') {
        logger.error(msg);
        throw new Error(`ENVIRONMENT_MIXING: ${details}`);
      } else {
        logger.warn(msg);
      }
    }

    return { safe: !mixing, environments: envs, mixingDetected: mixing };
  },

  /**
   * Validate a single provider is in the expected environment.
   * @param {string} providerName
   * @param {'production'|'sandbox'} expectedEnv
   * @returns {{ safe: boolean, actual: string, expected: string }}
   */
  validate(providerName, expectedEnv) {
    const actual = this.getEnvironment(providerName);
    const safe   = actual === expectedEnv || actual === 'unknown';

    if (!safe) {
      logger.warn(`[EnvironmentGuard] ${providerName} is in ${actual} but ${expectedEnv} expected`);
    }

    return { safe, actual, expected: expectedEnv, provider: providerName };
  },

  /**
   * Returns a full environment report for all known providers.
   * Useful for the admin certification dashboard.
   */
  auditAll() {
    const providers = ['fincra', 'anchor', 'paystack', 'grey', 'nowpayments'];
    const report    = {};

    for (const p of providers) {
      report[p] = {
        environment: this.getEnvironment(p),
        envVarSet:   !!process.env[ENV_VAR_MAP[p]],
        keyPresent:  !!process.env[API_KEY_MAP[p]],
      };
    }

    const envValues = Object.values(report).map(r => r.environment).filter(e => e !== 'unknown');
    const unique    = [...new Set(envValues)];

    return {
      providers: report,
      uniform:   unique.length <= 1,
      environments: unique,
      mixingRisk: unique.length > 1 ? 'HIGH' : 'NONE',
      auditedAt: new Date().toISOString(),
    };
  },
};

module.exports = EnvironmentGuard;
