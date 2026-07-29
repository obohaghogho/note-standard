'use strict';
/**
 * ProviderCertificationRegistry.js
 * =================================
 * Provider Certification Framework.
 * Before any provider can handle live traffic, it must pass a
 * capability checklist. This registry tracks certification state
 * and enforces the gate before the RoutingEngine uses a provider.
 *
 * Certification requirements:
 *   - Webhook validation implemented and tested
 *   - Idempotency support confirmed
 *   - Reversal support (or explicit exemption granted)
 *   - Reconciliation endpoint available
 *   - Health check endpoint working
 *   - Settlement reporting configured
 *   - Audit logging enabled
 *   - API key in environment and last-rotated within policy
 *
 * @module config/ProviderCertificationRegistry
 */

const supabase = require('../config/database');
const logger   = require('../utils/logger');

// Minimum capability requirements for production routing
const REQUIRED_CAPABILITIES = [
  'cap_webhook_validation',
  'cap_idempotency',
  'cap_health_check',
  'cap_audit_logging',
];

// Recommended (non-blocking warnings)
const RECOMMENDED_CAPABILITIES = [
  'cap_reversal',
  'cap_reconciliation',
  'cap_settlement_reporting',
];

// API key env var map per provider
const PROVIDER_ENV_KEYS = {
  fincra:      ['FINCRA_SECRET_KEY', 'FINCRA_BUSINESS_ID'],
  anchor:      ['ANCHOR_SECRET_KEY'],
  paystack:    ['PAYSTACK_SECRET_KEY'],
  grey:        ['GREY_API_KEY'],
  nowpayments: ['NOWPAYMENTS_API_KEY'],
};

// Max days since last API key rotation before warning
const KEY_ROTATION_WARN_DAYS = 90;

const ProviderCertificationRegistry = {
  /**
   * Run the full certification checklist for a provider.
   * Returns certification status + detailed report.
   */
  async certify(providerKey) {
    const key = String(providerKey).toLowerCase();
    const report = {
      provider:    key,
      certified:   false,
      score:       0,
      passed:      [],
      failed:      [],
      warnings:    [],
      timestamp:   new Date().toISOString(),
    };

    // 1. DB record check
    const { data: dbRecord } = await supabase
      .from('banking_providers')
      .select('*')
      .eq('provider_key', key)
      .maybeSingle();

    if (!dbRecord) {
      report.failed.push({ check: 'DB_REGISTRATION', detail: `Provider ${key} not found in banking_providers table` });
      return report;
    }

    // 2. Required capability checks
    for (const cap of REQUIRED_CAPABILITIES) {
      if (dbRecord[cap] === true) {
        report.passed.push({ check: cap, detail: 'Configured in banking_providers' });
        report.score += 15;
      } else {
        report.failed.push({ check: cap, detail: `Missing required capability: ${cap}` });
      }
    }

    // 3. Recommended capability checks (warnings only)
    for (const cap of RECOMMENDED_CAPABILITIES) {
      if (dbRecord[cap] === true) {
        report.passed.push({ check: cap, detail: 'Recommended capability present' });
        report.score += 5;
      } else {
        report.warnings.push({ check: cap, detail: `Recommended capability missing: ${cap}` });
      }
    }

    // 4. Env key presence check
    const envKeys = PROVIDER_ENV_KEYS[key] || [];
    const missingKeys = envKeys.filter(k => !process.env[k]);
    if (missingKeys.length === 0) {
      report.passed.push({ check: 'ENV_KEYS', detail: `All required env vars present: ${envKeys.join(', ')}` });
      report.score += 10;
    } else {
      report.failed.push({ check: 'ENV_KEYS', detail: `Missing env vars: ${missingKeys.join(', ')}` });
    }

    // 5. API key rotation freshness
    if (dbRecord.api_key_last_rotated) {
      const daysSince = Math.floor((Date.now() - new Date(dbRecord.api_key_last_rotated).getTime()) / 86400000);
      if (daysSince > KEY_ROTATION_WARN_DAYS) {
        report.warnings.push({ check: 'KEY_ROTATION', detail: `API key not rotated in ${daysSince} days (policy: ${KEY_ROTATION_WARN_DAYS}d)` });
      } else {
        report.passed.push({ check: 'KEY_ROTATION', detail: `API key rotated ${daysSince} days ago` });
        report.score += 5;
      }
    } else {
      report.warnings.push({ check: 'KEY_ROTATION', detail: 'api_key_last_rotated not recorded' });
    }

    // 6. Webhook URL configured
    if (dbRecord.webhook_url_configured) {
      report.passed.push({ check: 'WEBHOOK_URL', detail: 'Webhook URL confirmed configured' });
      report.score += 5;
    } else {
      report.warnings.push({ check: 'WEBHOOK_URL', detail: 'webhook_url_configured not confirmed' });
    }

    // 7. SLA targets defined
    if (dbRecord.sla_uptime_pct && dbRecord.sla_max_latency_ms) {
      report.passed.push({ check: 'SLA_TARGETS', detail: `Uptime: ${dbRecord.sla_uptime_pct}% | Max latency: ${dbRecord.sla_max_latency_ms}ms` });
      report.score += 5;
    } else {
      report.warnings.push({ check: 'SLA_TARGETS', detail: 'SLA targets not configured' });
    }

    // Certification decision: all required capabilities must pass
    const allRequired = REQUIRED_CAPABILITIES.every(cap => dbRecord[cap] === true);
    const hasEnvKeys  = missingKeys.length === 0;
    report.certified  = allRequired && hasEnvKeys;
    report.score      = Math.min(report.score, 100);

    // Update DB record
    try {
      await supabase
        .from('banking_providers')
        .update({
          is_certified:       report.certified,
          certification_date: report.certified ? new Date().toISOString() : null,
        })
        .eq('provider_key', key);
    } catch (e) {
      logger.warn(`[CertRegistry] DB update failed: ${e.message}`);
    }

    logger.info(`[CertRegistry] ${key} certification: ${report.certified ? 'PASSED' : 'FAILED'} (score ${report.score})`);
    return report;
  },

  /**
   * Quick check — is a provider certified and eligible for live routing?
   */
  async isEligible(providerKey) {
    const { data } = await supabase
      .from('banking_providers')
      .select('is_certified, is_enabled')
      .eq('provider_key', String(providerKey).toLowerCase())
      .maybeSingle();
    return data?.is_certified === true && data?.is_enabled === true;
  },

  /**
   * [Phase 17] Run a live health probe against the provider's adapter.
   * Non-blocking — failure downgrades score but doesn't block certification.
   */
  async _runLiveHealthProbe(providerKey) {
    const ADAPTER_MAP = {
      fincra:      () => require('../services/payment/adapters/FincraAdapter'),
      anchor:      () => require('../services/payment/adapters/AnchorAdapter'),
      paystack:    () => require('../services/payment/adapters/PaystackAdapter'),
      grey:        () => require('../services/payment/adapters/GreyAdapter'),
      nowpayments: () => require('../services/payment/adapters/NowPaymentsAdapter'),
    };
    const loader = ADAPTER_MAP[providerKey];
    if (!loader) return { status: 'NO_ADAPTER', latencyMs: 0 };
    try {
      const adapter = loader();
      if (typeof adapter.healthCheck !== 'function') return { status: 'NO_HEALTHCHECK', latencyMs: 0 };
      const result = await Promise.race([
        adapter.healthCheck(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 6000)),
      ]);
      return result;
    } catch (e) {
      return { status: 'DOWN', latencyMs: 0, error: e.message };
    }
  },

  /**
   * Certify all registered providers with live health probes and environment check.
   * [Phase 17] Enhanced version — includes EnvironmentGuard audit.
   */
  async certifyAll() {
    const { data: providers } = await supabase.from('banking_providers').select('provider_key');

    // [Phase 17] Run environment isolation audit across all providers
    let envAudit = null;
    try {
      const EnvironmentGuard = require('../services/payment/EnvironmentGuard');
      envAudit = EnvironmentGuard.auditAll();
      if (!envAudit.uniform) {
        logger.warn(`[CertRegistry] Environment mixing detected across providers: ${JSON.stringify(envAudit.environments)}`);
      } else {
        logger.info(`[CertRegistry] Environment uniform across all providers: ${envAudit.environments[0] || 'unknown'}`);
      }
    } catch (e) {
      logger.warn(`[CertRegistry] EnvironmentGuard audit failed (non-blocking): ${e.message}`);
    }

    const results = {};
    for (const p of (providers || [])) {
      const certResult = await this.certify(p.provider_key);

      // [Phase 17] Augment with live health probe
      try {
        const health = await this._runLiveHealthProbe(p.provider_key);
        certResult.liveHealth = health;
        if (health.status === 'DOWN') {
          certResult.warnings.push({ check: 'LIVE_HEALTH', detail: `Live health probe returned DOWN (latency: ${health.latencyMs}ms)` });
        } else if (health.status === 'HEALTHY') {
          certResult.score = Math.min(100, certResult.score + 5);
          certResult.passed.push({ check: 'LIVE_HEALTH', detail: `Live health probe OK (${health.latencyMs}ms)` });
        }
      } catch (e) {
        certResult.warnings.push({ check: 'LIVE_HEALTH', detail: `Live probe error: ${e.message}` });
      }

      results[p.provider_key] = certResult;
    }

    // Attach environment audit to all results
    if (envAudit) {
      for (const key of Object.keys(results)) {
        results[key].environmentAudit = {
          environment:  envAudit.providers?.[key]?.environment || 'unknown',
          uniform:      envAudit.uniform,
          mixingRisk:   envAudit.mixingRisk,
        };
      }
    }

    return results;
  },

  REQUIRED_CAPABILITIES,
  RECOMMENDED_CAPABILITIES,
};

module.exports = ProviderCertificationRegistry;
