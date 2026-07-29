'use strict';
/**
 * ProviderHealthEngine.js
 * =======================
 * Tracks real-time health of every payment provider.
 *
 * Per provider it maintains:
 *   - Circuit breaker state (CLOSED / OPEN / HALF_OPEN)
 *   - Rolling latency metrics
 *   - Success/failure rates
 *   - Webhook delay tracking
 *   - Balance sync health
 *
 * Circuit breaker logic:
 *   CLOSED    → Normal operation. Failures increment counter.
 *   OPEN      → Provider excluded from GatewayRouter. Set after N failures.
 *   HALF_OPEN → Testing recovery. One probe is attempted.
 *               If it succeeds → CLOSED. If it fails → OPEN again.
 *
 * Integration:
 *   - Updates provider_health_status table
 *   - Appends probe results to provider_health_probes
 *   - Calls GatewayRouter.setHealth() so live routing reflects health
 *   - Writes to ImmutableAuditLog on circuit state changes
 *
 * @module services/treasury/ProviderHealthEngine
 */

const supabase         = require('../../config/database');
const logger           = require('../../utils/logger');
const GatewayRouter    = require('../payment/GatewayRouter');

const FAILURE_THRESHOLD  = 5;   // consecutive failures before OPEN
const HALF_OPEN_DELAY_MS = 30 * 1000; // wait 30s before HALF_OPEN probe

// Track when circuits were opened (for HALF_OPEN transition)
const _circuitOpenedAt = {};

class ProviderHealthEngine {

  // ── 1. Record a Probe Result ──────────────────────────────────────────────

  /**
   * Called by ProviderHealthWorker after each probe.
   *
   * @param {string}  provider      - e.g. 'fincra'
   * @param {string}  probeType     - 'PING' | 'BALANCE_FETCH' | 'WEBHOOK_CHECK' | 'FULL_HEALTH'
   * @param {object}  result
   * @param {boolean} result.success
   * @param {number}  result.latencyMs
   * @param {number}  [result.httpStatus]
   * @param {string}  [result.error]
   * @param {object}  [result.metadata]
   */
  async recordProbe(provider, probeType, result) {
    const { success, latencyMs, httpStatus, error: probeError, metadata } = result;
    const status = success ? 'SUCCESS' : 'FAILED';

    // Append to probe history
    await supabase.from('provider_health_probes').insert({
      provider,
      probe_type:    probeType,
      status,
      latency_ms:    latencyMs,
      http_status:   httpStatus,
      error_message: probeError || null,
      metadata:      metadata   || {},
    });

    // Fetch current health row
    const { data: current } = await supabase
      .from('provider_health_status')
      .select('*')
      .eq('provider', provider)
      .maybeSingle();

    const patch = this._computePatch(current, success, latencyMs, probeType);
    patch.last_probe_at = new Date().toISOString();

    if (success) {
      patch.last_healthy_at      = new Date().toISOString();
      patch.consecutive_failures = 0;
    } else {
      patch.last_failure_at      = new Date().toISOString();
      patch.consecutive_failures = (current?.consecutive_failures || 0) + 1;
    }

    // Circuit breaker state machine
    const newCircuitState = this._evaluateCircuit(
      current,
      patch.consecutive_failures,
      success
    );

    if (newCircuitState !== current?.circuit_breaker) {
      patch.circuit_breaker = newCircuitState;
      if (newCircuitState === 'OPEN') {
        patch.circuit_opened_at = new Date().toISOString();
        patch.circuit_reason    = probeError || 'Consecutive failure threshold exceeded';
        _circuitOpenedAt[provider] = Date.now();

        // Immediately remove from GatewayRouter
        GatewayRouter.setHealth(provider, 'DOWN');
        logger.error(`[ProviderHealthEngine] Circuit OPENED for ${provider}. Provider removed from routing.`);

        // Audit log
        this._auditCircuitChange(provider, 'OPEN', probeError).catch(() => {});
      } else if (newCircuitState === 'CLOSED') {
        patch.circuit_opened_at = null;
        patch.circuit_reason    = null;
        patch.consecutive_failures = 0;

        // Restore to GatewayRouter
        GatewayRouter.setHealth(provider, 'HEALTHY');
        logger.info(`[ProviderHealthEngine] Circuit CLOSED for ${provider}. Provider restored to routing.`);
        this._auditCircuitChange(provider, 'CLOSED', 'Recovery confirmed').catch(() => {});
      } else if (newCircuitState === 'HALF_OPEN') {
        GatewayRouter.setHealth(provider, 'DEGRADED');
        logger.warn(`[ProviderHealthEngine] Circuit HALF_OPEN for ${provider}. Testing recovery.`);
      }
    } else {
      // Status update only (no circuit change)
      const gatewayStatus = success ? 'HEALTHY' : (patch.consecutive_failures >= 2 ? 'DEGRADED' : 'HEALTHY');
      if (current?.circuit_breaker === 'CLOSED') {
        GatewayRouter.setHealth(provider, gatewayStatus);
      }
    }

    // Overall provider status
    patch.status = this._deriveStatus(patch.circuit_breaker || current?.circuit_breaker, success, patch.consecutive_failures);

    // Upsert health row
    await supabase
      .from('provider_health_status')
      .upsert({ provider, ...patch }, { onConflict: 'provider' });

    return { provider, status: patch.status, circuit: patch.circuit_breaker || current?.circuit_breaker };
  }

  // ── 2. Record Webhook Receipt ────────────────────────────────────────────

  /**
   * Called from webhook handlers to track webhook health.
   *
   * @param {string} provider
   * @param {boolean} success
   * @param {number} [delayMs]
   */
  async recordWebhook(provider, success, delayMs) {
    const patch = {
      last_webhook_at:  new Date().toISOString(),
      webhook_delay_ms: delayMs || null,
    };

    if (success) {
      patch.webhooks_received = supabase.rpc ? undefined : null; // increment handled in DB
    } else {
      patch.webhooks_failed = supabase.rpc ? undefined : null;
    }

    // Simple increment via SQL expression is safer here
    const incrementCol = success ? 'webhooks_received' : 'webhooks_failed';
    await supabase.rpc('increment_provider_health_counter', {
      p_provider: provider,
      p_column:   incrementCol,
    }).catch(() => {
      // RPC may not exist in all environments; fall back to upsert
      supabase.from('provider_health_status')
        .upsert({ provider, ...patch }, { onConflict: 'provider' })
        .catch(e => logger.warn(`[ProviderHealthEngine] Webhook record fallback failed: ${e.message}`));
    });
  }

  // ── 3. Get All Provider Statuses ─────────────────────────────────────────

  async getAllStatuses() {
    const { data, error } = await supabase
      .from('provider_health_status')
      .select('*')
      .order('provider');
    if (error) logger.error(`[ProviderHealthEngine] getAllStatuses error: ${error.message}`);
    return data || [];
  }

  // ── 4. Get Probe History ─────────────────────────────────────────────────

  async getProbeHistory(provider, limit = 100) {
    const { data } = await supabase
      .from('provider_health_probes')
      .select('*')
      .eq('provider', provider)
      .order('probed_at', { ascending: false })
      .limit(limit);
    return data || [];
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _computePatch(current, success, latencyMs, probeType) {
    const patch = {};
    // Rolling totals
    patch.total_requests      = (current?.total_requests || 0) + 1;
    patch.successful_requests = (current?.successful_requests || 0) + (success ? 1 : 0);
    patch.failed_requests     = (current?.failed_requests     || 0) + (success ? 0 : 1);

    patch.success_rate = patch.total_requests > 0
      ? parseFloat(((patch.successful_requests / patch.total_requests) * 100).toFixed(2))
      : 100.00;

    // Latency (simple rolling average — full percentiles need time-window aggregation)
    if (latencyMs) {
      const prevAvg = current?.avg_latency_ms || latencyMs;
      const n       = patch.total_requests;
      patch.avg_latency_ms = Math.round((prevAvg * (n - 1) + latencyMs) / n);
      patch.min_latency_ms = Math.min(current?.min_latency_ms || latencyMs, latencyMs);
      patch.max_latency_ms = Math.max(current?.max_latency_ms || latencyMs, latencyMs);
    }

    if (probeType === 'BALANCE_FETCH') {
      patch.last_balance_sync_at = new Date().toISOString();
      if (!success) {
        patch.balance_sync_failures = (current?.balance_sync_failures || 0) + 1;
      }
    }

    return patch;
  }

  _evaluateCircuit(current, consecutiveFailures, success) {
    const circuitState = current?.circuit_breaker || 'CLOSED';

    if (circuitState === 'CLOSED') {
      if (consecutiveFailures >= FAILURE_THRESHOLD) return 'OPEN';
      return 'CLOSED';
    }

    if (circuitState === 'OPEN') {
      const openedAt = _circuitOpenedAt[current?.provider] || 0;
      if (Date.now() - openedAt >= HALF_OPEN_DELAY_MS) return 'HALF_OPEN';
      return 'OPEN';
    }

    if (circuitState === 'HALF_OPEN') {
      return success ? 'CLOSED' : 'OPEN';
    }

    return 'CLOSED';
  }

  _deriveStatus(circuitState, success, failures) {
    if (circuitState === 'OPEN')      return 'DOWN';
    if (circuitState === 'HALF_OPEN') return 'DEGRADED';
    if (!success && failures >= 2)    return 'DEGRADED';
    if (success)                      return 'HEALTHY';
    return 'UNKNOWN';
  }

  async _auditCircuitChange(provider, newState, reason) {
    try {
      const ImmutableAuditLog = require('./ImmutableAuditLog');
      await ImmutableAuditLog.record({
        event_type:    'PROVIDER_HEALTH_CHANGE',
        event_subtype: `CIRCUIT_${newState}`,
        actor_type:    'WORKER',
        actor_id:      'ProviderHealthEngine',
        subject_type:  'PROVIDER',
        subject_id:    provider,
        provider,
        reason,
      });
    } catch {}
  }
}

module.exports = new ProviderHealthEngine();
