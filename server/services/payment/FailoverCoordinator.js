'use strict';
/**
 * FailoverCoordinator.js
 * ======================
 * Orchestrates automatic 3-hop provider failover.
 *
 * Chain: Provider A → Provider B → Provider C → Manual Queue
 *
 * Each hop:
 *   1. Selects next best provider via RoutingEngine (excluding failed providers)
 *   2. Executes the operation via the provider's adapter
 *   3. On success: links provider reference to CorrelationEngine, returns result
 *   4. On failure: records failover event, tries next provider
 *   5. On chain exhaustion: routes to manual queue
 *
 * Every hop is recorded in routing_decisions + ImmutableAuditLog.
 * The FinancialOrchestrator calls this instead of calling providers directly.
 *
 * @module services/payment/FailoverCoordinator
 */

const logger            = require('../../utils/logger');
const supabase          = require('../../config/database');
const RoutingEngine     = require('./RoutingEngine');
const CorrelationEngine = require('../orchestration/CorrelationEngine');
const ImmutableAuditLog = require('../treasury/ImmutableAuditLog');

const MAX_HOPS = parseInt(process.env.FAILOVER_MAX_HOPS || '3', 10);

const FailoverCoordinator = {
  /**
   * Execute an operation with automatic failover across providers.
   *
   * @param {Object}   routingParams  - Params for RoutingEngine.selectBestProvider()
   * @param {Function} executorFn     - async (adapter, providerName) => result
   * @param {Object}   [context]      - { correlationId, executionLogId, userId }
   * @returns {Promise<{ success, provider, result, hopsAttempted, manualQueue }>}
   */
  async execute(routingParams, executorFn, context = {}) {
    const { correlationId, executionLogId, userId } = context;
    const failedProviders = [];
    let lastError = null;

    for (let hop = 0; hop < MAX_HOPS; hop++) {
      let provider, adapter, score;

      try {
        // Select next best provider (excluding already-failed ones)
        const selection = await RoutingEngine.selectBestProvider({
          ...routingParams,
          excludeProviders: failedProviders,
          correlationId,
        });

        provider = selection.provider;
        adapter  = selection.adapter;
        score    = selection.score;

        if (hop > 0) {
          logger.warn(`[FailoverCoordinator] Hop ${hop + 1}: trying ${provider} (failed: ${failedProviders.join(', ')})`);
          await ImmutableAuditLog.record({
            event_type:   'FAILOVER_HOP',
            actor_type:   'SYSTEM',
            actor_id:     'FailoverCoordinator',
            subject_type: 'PAYMENT',
            subject_id:   correlationId || 'UNKNOWN',
            reason:       `Hop ${hop + 1}: failing over to ${provider} from ${failedProviders.join(', ')}`,
            metadata:     { hop, failedProviders, selectedProvider: provider, score },
          }).catch(() => {});
        }

        // Execute via provider adapter
        const result = await executorFn(adapter, provider);

        // Link provider reference to correlation engine
        if (executionLogId && result) {
          await CorrelationEngine.linkProviderRef(
            executionLogId,
            provider,
            result.providerReference || result.reference || 'unknown',
            hop === 0 ? 'SUCCESS' : 'FAILOVER_SUCCESS'
          );
        }

        // Update routing decision outcome
        await this._updateDecisionOutcome(correlationId, provider, 'SUCCESS');

        logger.info(`[FailoverCoordinator] Success on hop ${hop + 1} via ${provider}`);
        return { success: true, provider, result, hopsAttempted: hop + 1, manualQueue: false };

      } catch (err) {
        lastError = err;
        logger.warn(`[FailoverCoordinator] Hop ${hop + 1} failed on ${provider}: ${err.message}`);

        if (provider) {
          failedProviders.push(provider);
          await this._updateDecisionOutcome(correlationId, provider, 'FAILED');

          await ImmutableAuditLog.record({
            event_type:   'PROVIDER_FAILURE',
            actor_type:   'SYSTEM',
            actor_id:     'FailoverCoordinator',
            subject_type: 'PAYMENT',
            subject_id:   correlationId || 'UNKNOWN',
            reason:       `${provider} failed on hop ${hop + 1}: ${err.message}`,
            metadata:     { hop, provider, error: err.message },
          }).catch(() => {});
        }

        // Check if more hops possible
        if (hop < MAX_HOPS - 1) continue;
      }
    }

    // ── Chain exhausted → Manual Queue ────────────────────────────────────────
    logger.error(`[FailoverCoordinator] All ${MAX_HOPS} hops exhausted. Routing to manual queue.`);
    const manualRef = await this._routeToManualQueue(routingParams, context, failedProviders, lastError);

    await ImmutableAuditLog.record({
      event_type:   'MANUAL_QUEUE_ROUTED',
      actor_type:   'SYSTEM',
      actor_id:     'FailoverCoordinator',
      subject_type: 'PAYMENT',
      subject_id:   correlationId || 'UNKNOWN',
      reason:       `All failover hops exhausted after trying: ${failedProviders.join(', ')}`,
      metadata:     { failedProviders, manualRef, lastError: lastError?.message },
    }).catch(() => {});

    return {
      success:         false,
      provider:        null,
      result:          null,
      hopsAttempted:   MAX_HOPS,
      manualQueue:     true,
      manualQueueRef:  manualRef,
      error:           lastError?.message || 'All providers failed',
    };
  },

  /**
   * Route a failed payment to the manual queue (payout_requests).
   */
  async _routeToManualQueue(routingParams, context, failedProviders, lastError) {
    const { data } = await supabase
      .from('payout_requests')
      .insert({
        user_id:          context.userId || null,
        currency:         routingParams.currency,
        amount:           routingParams.amount || 0,
        status:           'MANUAL_REVIEW',
        notes:            `Auto-queued after failover exhaustion. Tried: ${failedProviders.join(', ')}. Last error: ${lastError?.message || 'unknown'}`,
        correlation_id:   context.correlationId || null,
        metadata: {
          failedProviders,
          routingParams,
          lastError: lastError?.message,
          autoQueued: true,
          autoQueuedAt: new Date().toISOString(),
        },
      })
      .select('id')
      .single()
      .catch(e => {
        logger.error(`[FailoverCoordinator] Manual queue insert failed: ${e.message}`);
        return { data: null };
      });

    return data?.id || null;
  },

  async _updateDecisionOutcome(correlationId, provider, outcome) {
    if (!correlationId) return;
    await supabase
      .from('routing_decisions')
      .update({ outcome, updated_at: new Date().toISOString() })
      .eq('correlation_id', correlationId)
      .eq('selected_provider', provider)
      .catch(() => {});
  },
};

module.exports = FailoverCoordinator;
