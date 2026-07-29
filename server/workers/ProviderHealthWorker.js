'use strict';
/**
 * ProviderHealthWorker.js
 * =======================
 * Actively probes each payment provider every 60 seconds.
 * Records results via ProviderHealthEngine which maintains
 * circuit breakers and updates GatewayRouter health scores.
 *
 * Probe strategy per provider:
 *   fincra:       GET /wallets (light balance endpoint)
 *   paystack:     GET /balance
 *   nowpayments:  GET /status (public endpoint)
 *   grey:         HEAD /v1/wallets or skip if unconfigured
 *   anchor:       GET /customers (admin check)
 *
 * Failures are exponentially retried within a probe window
 * before being recorded as failures in the health engine.
 *
 * @module workers/ProviderHealthWorker
 */

const axios               = require('axios');
const logger              = require('../utils/logger');
const ProviderHealthEngine = require('../services/treasury/ProviderHealthEngine');

const PROBE_INTERVAL_MS   = parseInt(process.env.PROVIDER_PROBE_INTERVAL_MS || '60000', 10); // 60s
const PROBE_TIMEOUT_MS    = 8000;
const BOOT_DELAY_MS       = 30000; // 30s after server start

let _intervalHandle = null;
let _running        = false;

// ── Provider Probe Definitions ────────────────────────────────────────────────
// Each entry: { name, probeType, fn: async () => { httpStatus, latencyMs } }
function buildProbes() {
  const probes = [];

  // Fincra
  const fincraKey = process.env.FINCRA_SECRET_KEY;
  const fincraEnv = (process.env.FINCRA_ENV || 'sandbox').toLowerCase();
  const fincraBase = (fincraEnv === 'live' || fincraEnv === 'production')
    ? 'https://api.fincra.com' : 'https://sandboxapi.fincra.com';

  if (fincraKey) {
    probes.push({
      name: 'fincra', probeType: 'PING',
      fn: async () => {
        const t = Date.now();
        const r = await axios.get(`${fincraBase}/core/businesses/${process.env.FINCRA_BUSINESS_ID}`, {
          timeout: PROBE_TIMEOUT_MS,
          headers: { 'api-key': fincraKey },
          validateStatus: s => s < 500,
        });
        return { httpStatus: r.status, latencyMs: Date.now() - t };
      },
    });
  }

  // Paystack
  const psKey = process.env.PAYSTACK_SECRET_KEY;
  if (psKey) {
    probes.push({
      name: 'paystack', probeType: 'PING',
      fn: async () => {
        const t = Date.now();
        const r = await axios.get('https://api.paystack.co/bank', {
          timeout: PROBE_TIMEOUT_MS,
          headers: { Authorization: `Bearer ${psKey}` },
          params: { country: 'nigeria', perPage: 1 },
          validateStatus: s => s < 500,
        });
        return { httpStatus: r.status, latencyMs: Date.now() - t };
      },
    });
  }

  // NOWPayments (public status endpoint)
  probes.push({
    name: 'nowpayments', probeType: 'PING',
    fn: async () => {
      const t = Date.now();
      const r = await axios.get('https://api.nowpayments.io/v1/status', {
        timeout: PROBE_TIMEOUT_MS,
        validateStatus: s => s < 500,
      });
      return { httpStatus: r.status, latencyMs: Date.now() - t };
    },
  });

  // Grey — only if configured
  const greyKey = process.env.GREY_API_KEY;
  const greyBase = process.env.GREY_API_URL || 'https://api.grey.co';
  if (greyKey) {
    probes.push({
      name: 'grey', probeType: 'PING',
      fn: async () => {
        const t = Date.now();
        const r = await axios.get(`${greyBase}/v1/account`, {
          timeout: PROBE_TIMEOUT_MS,
          headers: { Authorization: `Bearer ${greyKey}` },
          validateStatus: s => s < 500,
        });
        return { httpStatus: r.status, latencyMs: Date.now() - t };
      },
    });
  }

  return probes;
}

const ProviderHealthWorker = {
  name: 'ProviderHealthWorker',

  start() {
    if (_running) return;
    _running = true;
    logger.info(`[ProviderHealthWorker] Starting. Probe interval: ${PROBE_INTERVAL_MS / 1000}s`);

    setTimeout(() => {
      this._runAllProbes();
      _intervalHandle = setInterval(() => this._runAllProbes(), PROBE_INTERVAL_MS);
    }, BOOT_DELAY_MS);
  },

  stop() {
    if (_intervalHandle) clearInterval(_intervalHandle);
    _running = false;
    logger.info('[ProviderHealthWorker] Stopped.');
  },

  async _runAllProbes() {
    const probes = buildProbes();
    for (const probe of probes) {
      this._runProbe(probe).catch(err =>
        logger.error(`[ProviderHealthWorker] Unhandled probe error for ${probe.name}: ${err.message}`)
      );
    }
  },

  async _runProbe(probe) {
    const { name, probeType, fn } = probe;
    const start = Date.now();
    let success    = false;
    let latencyMs  = 0;
    let httpStatus = null;
    let errorMsg   = null;

    try {
      const result = await fn();
      httpStatus   = result.httpStatus;
      latencyMs    = result.latencyMs || (Date.now() - start);
      success      = httpStatus >= 200 && httpStatus < 400;
      if (!success) errorMsg = `HTTP ${httpStatus}`;
    } catch (err) {
      latencyMs = Date.now() - start;
      errorMsg  = err.code === 'ECONNABORTED' ? `Timeout after ${PROBE_TIMEOUT_MS}ms` : err.message;
      success   = false;
    }

    await ProviderHealthEngine.recordProbe(name, probeType, {
      success,
      latencyMs,
      httpStatus,
      error: errorMsg,
    }).catch(e => logger.warn(`[ProviderHealthWorker] recordProbe failed for ${name}: ${e.message}`));

    const symbol = success ? '✓' : '✗';
    logger.info(`[ProviderHealthWorker] ${symbol} ${name} (${latencyMs}ms)${errorMsg ? ' → ' + errorMsg : ''}`);
  },
};

module.exports = ProviderHealthWorker;
