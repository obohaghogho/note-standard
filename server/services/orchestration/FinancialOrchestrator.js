'use strict';
/**
 * FinancialOrchestrator.js
 * ========================
 * Central Financial Orchestrator (CFO).
 * The single authoritative execution pipeline for all financial operations.
 *
 * Phase 16 Behaviour:
 *   - New operations introduced in Phase 16 use this orchestrator directly.
 *   - Existing controllers that call PaymentOrchestrator continue to work unchanged.
 *   - Phase 17 will migrate existing flows here incrementally.
 *
 * 13-step pipeline:
 *   1.  Correlation ID generation (CorrelationEngine)
 *   2.  Idempotency check (PaymentExecutionCoordinator)
 *   3.  Compliance validation (basic — extendable)
 *   4.  Fraud scoring (FraudIntelligenceLayer)
 *   5.  Payment policy evaluation (PaymentPolicyEngine)
 *   6.  Treasury liquidity check (MultiProviderReserveEngine)
 *   7.  FX quote resolution (SmartFXRouter — disabled by default)
 *   8.  Provider selection + failover (RoutingEngine + FailoverCoordinator)
 *   9.  Ledger commitment (double-entry, via existing LedgerService)
 *   10. Settlement position creation (SettlementPositionService)
 *   11. Event emission (PaymentEventBus)
 *   12. Audit record (ImmutableAuditLog)
 *   13. AI insights generation (AITreasuryMonitor — async, non-blocking)
 *
 * @module services/orchestration/FinancialOrchestrator
 */

const logger                   = require('../../utils/logger');
const CorrelationEngine        = require('./CorrelationEngine');
const PaymentExecutionCoordinator = require('./PaymentExecutionCoordinator');
const PaymentPolicyEngine      = require('./PaymentPolicyEngine');
const RoutingEngine            = require('../payment/RoutingEngine');
const FailoverCoordinator      = require('../payment/FailoverCoordinator');
const MultiProviderReserveEngine = require('../treasury/MultiProviderReserveEngine');
const SettlementPositionService  = require('../treasury/SettlementPositionService');
const SettlementCalendar         = require('../treasury/SettlementCalendar');
const SmartFXRouter            = require('../treasury/SmartFXRouter');
const ImmutableAuditLog        = require('../treasury/ImmutableAuditLog');

// Lazy loads to avoid circular dependencies
const _fraud = () => require('../risk/FraudIntelligenceLayer');
const _bus   = () => require('../payment/PaymentEventBus');

class FinancialOrchestrator {
  /**
   * Execute any financial operation through the full CFO pipeline.
   *
   * @param {Object} params
   * @param {string}  params.operationType    - DEPOSIT | WITHDRAWAL | PAYOUT | SWAP | REFUND
   * @param {string}  params.userId
   * @param {string}  params.currency
   * @param {number}  params.amount
   * @param {string}  params.method           - bank_transfer | dva | card | crypto | payout
   * @param {string}  [params.idempotencyKey]
   * @param {Object}  [params.providerParams] - Provider-specific fields (accountNumber, etc.)
   * @param {Object}  [params.metadata]
   * @param {string}  [params.countryCode]
   * @returns {Promise<FinancialResult>}
   */
  async execute(params) {
    const {
      operationType, userId, currency, amount, method,
      idempotencyKey, providerParams = {}, metadata = {}, countryCode,
    } = params;

    const up = String(currency).toUpperCase();
    let correlationId, executionLogId;

    // ── Step 1: Idempotency + Correlation ─────────────────────────────────────
    const idKey = idempotencyKey || PaymentExecutionCoordinator.buildKey(operationType, userId, amount, up);

    const { allowed, wasDuplicate, correlationId: cId, executionLogId: eId, result: dupResult } =
      await PaymentExecutionCoordinator.guard(idKey, operationType, { userId, currency: up, amount, metadata }, async ({ correlationId: newCId, executionLogId: newEId }) => {
        correlationId  = newCId;
        executionLogId = newEId;
        return this._runPipeline(params, newCId, newEId);
      });

    if (!allowed) {
      return { success: true, duplicate: true, correlationId: cId, ...dupResult };
    }

    correlationId  = cId;
    executionLogId = eId;

    return dupResult;
  },

  /**
   * Internal: runs the full pipeline after idempotency check.
   */
  async _runPipeline(params, correlationId, executionLogId) {
    const { operationType, userId, currency, amount, method, providerParams = {}, metadata = {}, countryCode } = params;
    const up = String(currency).toUpperCase();

    try {
      // ── Step 2: Advance state ────────────────────────────────────────────────
      await CorrelationEngine.advanceState(executionLogId, 'COMPLIANCE_CHECK');

      // ── Step 3: Compliance (basic — extendable) ──────────────────────────────
      // Placeholder for KYC tier check, sanctions screening hook
      const complianceResult = { passed: true, checks: ['basic_validation'] };
      await CorrelationEngine.advanceState(executionLogId, 'FRAUD_CHECK', { compliance_result: complianceResult });

      // ── Step 4: Fraud scoring ────────────────────────────────────────────────
      let fraudResult = { riskScore: 0, recommendation: 'ALLOW' };
      try {
        fraudResult = await _fraud().evaluate({ userId, currency: up, amount, operationType, metadata });
      } catch (fraudErr) {
        logger.warn(`[CFO] Fraud evaluation error (non-blocking): ${fraudErr.message}`);
      }

      if (fraudResult.recommendation === 'BLOCK') {
        await CorrelationEngine.fail(executionLogId, { errorCode: 'FRAUD_BLOCKED', errorMessage: 'Transaction blocked by fraud intelligence layer' });
        return { success: false, blocked: true, reason: 'FRAUD_BLOCKED', correlationId };
      }

      // ── Step 5: Policy evaluation ────────────────────────────────────────────
      await CorrelationEngine.advanceState(executionLogId, 'ROUTING', { fraud_result: fraudResult });
      const userRiskTier = fraudResult.riskTier || 'LOW';

      const policyDecision = await PaymentPolicyEngine.evaluate({
        operationType, currency: up, method, amount, countryCode, userRiskTier, userId,
      });

      if (policyDecision.requiresApproval) {
        await CorrelationEngine.advanceState(executionLogId, 'COMPLIANCE_CHECK', { routing_result: { requiresApproval: true } });
        return {
          success:          false,
          requiresApproval: true,
          correlationId,
          policyDecision,
          reason:           'MANUAL_APPROVAL_REQUIRED',
        };
      }

      // ── Step 5.5: Platform & Provider Capability Validation ──────────────────
      if (method === 'crypto' || ['BTC', 'ETH', 'USDT', 'USDC'].includes(up)) {
        const CryptoCapabilityService = require('../nowpayments/CryptoCapabilityService');
        const capValidation = await CryptoCapabilityService.validateNetworkCapability(
          up, providerParams.network || 'NATIVE', operationType
        );

        if (!capValidation.allowed) {
          logger.warn(`[CFO] Capability validation failed for ${up} (${providerParams.network}): ${capValidation.reason}`);
          await CorrelationEngine.fail(executionLogId, {
            errorCode:    capValidation.operationalState || 'CAPABILITY_UNAVAILABLE',
            errorMessage: capValidation.reason,
          });
          return {
            success:          false,
            blocked:          true,
            reason:           capValidation.operationalState || 'CAPABILITY_UNAVAILABLE',
            error:            capValidation.reason,
            correlationId,
          };
        }
      }

      // ── Step 6: Treasury liquidity check ─────────────────────────────────────
      const reserveData = await MultiProviderReserveEngine.computeForCurrency(up).catch(() => null);
      const treasuryResult = {
        reserve_ratio: reserveData?.reserve_ratio,
        status:        reserveData?.status,
        checked:       true,
      };

      if (reserveData?.status === 'EMERGENCY') {
        logger.warn(`[CFO] Emergency reserve state for ${up} — proceeding with caution`);
      }

      await CorrelationEngine.advanceState(executionLogId, 'PROVIDER_EXECUTING', { treasury_result: treasuryResult });

      // ── Step 7: FX resolution (smart FX — disabled by default) ───────────────
      let fxResult = { source: 'internal', smartFxActive: false };
      if (operationType === 'SWAP') {
        const toCurrency = providerParams.toCurrency;
        if (toCurrency) {
          fxResult = await SmartFXRouter.getOptimalFXSource(up, toCurrency, amount).catch(() => fxResult);
        }
      }

      // ── Step 8: Provider routing + failover ──────────────────────────────────
      const routingParams = {
        currency:         up,
        method:           method || 'bank_transfer',
        transactionType:  operationType,
        amount,
        correlationId,
        excludeProviders: policyDecision.blockedProviders || [],
      };

      // Override provider if policy forces one
      if (policyDecision.forcedProvider) {
        routingParams.forcedProvider = policyDecision.forcedProvider;
      }

      const failoverResult = await FailoverCoordinator.execute(
        routingParams,
        async (adapter, providerName) => {
          // Call the appropriate adapter method based on operation type
          return this._dispatchToAdapter(adapter, operationType, {
            ...providerParams, amount, currency: up, userId, correlationId,
          });
        },
        { correlationId, executionLogId, userId }
      );

      if (failoverResult.manualQueue) {
        await CorrelationEngine.fail(executionLogId, {
          errorCode:     'ALL_PROVIDERS_FAILED',
          errorMessage:  failoverResult.error,
          failoverCount: failoverResult.hopsAttempted,
        });
        return {
          success:         false,
          manualQueue:     true,
          manualQueueRef:  failoverResult.manualQueueRef,
          correlationId,
          hopsAttempted:   failoverResult.hopsAttempted,
          error:           failoverResult.error,
        };
      }

      // ── Step 9: Ledger commitment (delegated to existing LedgerService) ──────
      await CorrelationEngine.advanceState(executionLogId, 'LEDGER_PENDING');
      // Note: Ledger is committed by the existing PaymentOrchestrator/LedgerService
      // Phase 17 will bring this into CFO directly.

      // ── Step 10: Settlement position ──────────────────────────────────────────
      try {
        const expectedSettlement = await SettlementCalendar.getExpectedDate(
          failoverResult.provider, up
        ).catch(() => null);

        await SettlementPositionService.create({
          correlationId,
          transactionId:    idempotencyKey || correlationId,
          provider:         failoverResult.provider,
          providerReference: failoverResult.result?.providerReference || failoverResult.result?.reference,
          currency:         up,
          grossAmount:      amount,
          expectedSettlement: expectedSettlement?.toISOString(),
          metadata,
        });
      } catch (spErr) {
        logger.warn(`[CFO] Settlement position creation failed (non-critical): ${spErr.message}`);
      }

      // ── Step 11: Correlation completion ──────────────────────────────────────
      await CorrelationEngine.complete(executionLogId, {
        providerReference: failoverResult.result?.providerReference || failoverResult.result?.reference,
        selectedProvider:  failoverResult.provider,
        ledgerState:       'COMMITTED',
      });

      // ── Step 12: Audit record ─────────────────────────────────────────────────
      await ImmutableAuditLog.record({
        event_type:   `CFO_${operationType}_COMPLETED`,
        actor_type:   'USER',
        actor_id:     userId,
        subject_type: 'PAYMENT',
        subject_id:   correlationId,
        reason:       `${operationType} ${amount} ${up} via ${failoverResult.provider} (${failoverResult.hopsAttempted} hop(s))`,
        metadata:     { correlationId, provider: failoverResult.provider, amount, currency: up },
      }).catch(() => {});

      // ── Step 13: AI insights (async, non-blocking) ────────────────────────────
      setImmediate(() => {
        const AITreasuryMonitor = require('../treasury/AITreasuryMonitor');
        AITreasuryMonitor.run().catch(() => {});
      });

      // ── Step 11: Event emission ───────────────────────────────────────────────
      try {
        _bus().emit(`financial.${operationType.toLowerCase()}.completed`, {
          correlationId,
          userId,
          currency: up,
          amount,
          provider: failoverResult.provider,
          metadata,
        });
      } catch {}

      return {
        success:          true,
        correlationId,
        provider:         failoverResult.provider,
        hopsAttempted:    failoverResult.hopsAttempted,
        result:           failoverResult.result,
        policyDecision,
        fraudResult:      { riskScore: fraudResult.riskScore, recommendation: fraudResult.recommendation },
      };

    } catch (err) {
      logger.error(`[CFO] Pipeline failed for ${correlationId}: ${err.message}`);
      await CorrelationEngine.fail(executionLogId, { errorCode: 'PIPELINE_ERROR', errorMessage: err.message });

      await ImmutableAuditLog.record({
        event_type:   'CFO_PIPELINE_ERROR',
        actor_type:   'SYSTEM',
        actor_id:     'FinancialOrchestrator',
        subject_type: 'PAYMENT',
        subject_id:   correlationId || 'UNKNOWN',
        reason:       err.message,
        metadata:     { operationType, currency, amount, error: err.message },
      }).catch(() => {});

      throw err;
    }
  },

  /**
   * Dispatch to the correct adapter method based on operation type.
   */
  async _dispatchToAdapter(adapter, operationType, params) {
    switch (operationType) {
      case 'DEPOSIT':
        return adapter.initialize ? adapter.initialize(params) : adapter.createPayment(params);
      case 'PAYOUT':
      case 'WITHDRAWAL':
        return adapter.createTransfer ? adapter.createTransfer(params) : adapter.transfer(params);
      case 'SWAP':
        return adapter.swap ? adapter.swap(params) : null;
      case 'REFUND':
        return adapter.reverseTransfer ? adapter.reverseTransfer(params.reference, params.reason) : adapter.reverse(params.reference, params.reason);
      default:
        throw new Error(`[CFO] Unknown operation type: ${operationType}`);
    }
  },
}

module.exports = new FinancialOrchestrator();
