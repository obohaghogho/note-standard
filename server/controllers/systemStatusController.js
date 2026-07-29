'use strict';
/**
 * systemStatusController.js
 * =========================
 * Lightweight Public System Status & End-to-End Correlation Trace Controller.
 *
 * Endpoints:
 *   - GET /api/system/status            Lightweight operational status for badges
 *   - GET /api/system/trace/:id         Cross-provider end-to-end transaction trace
 *
 * @module controllers/systemStatusController
 */

const supabase          = require('../config/database');
const CryptoCapability  = require('../services/nowpayments/CryptoCapabilityService');
const CorrelationEngine = require('../services/orchestration/CorrelationEngine');

exports.getPublicSystemStatus = async (req, res) => {
  try {
    const assetGroups = await CryptoCapability.getAvailableAssetsAndNetworks();
    const cryptoStatus = {};

    for (const group of assetGroups) {
      for (const net of group.networks) {
        const key = group.currency === 'BTC' || group.currency === 'ETH' 
          ? group.currency 
          : `${group.currency}_${net.network}`;
        
        let stateLabel = 'operational';
        if (net.status === 'WALLET_MISSING') stateLabel = 'coming_soon';
        else if (net.status === 'DISABLED')  stateLabel = 'maintenance';
        else if (net.status !== 'READY')     stateLabel = 'degraded';

        cryptoStatus[key] = stateLabel;
      }
    }

    res.json({
      status:    'operational',
      timestamp: new Date().toISOString(),
      crypto:    cryptoStatus,
      fiat: {
        NGN: 'operational',
        USD: 'operational',
        EUR: 'operational',
        GBP: 'operational',
      },
    });
  } catch (err) {
    res.status(500).json({ status: 'degraded', error: err.message });
  }
};

exports.getTransactionTrace = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Query Correlation Log
    const { data: correlation } = await supabase
      .from('payment_execution_logs')
      .select('*')
      .or(`correlation_id.eq.${id},reference_id.eq.${id},id.eq.${id}`)
      .maybeSingle();

    if (!correlation) {
      return res.status(404).json({ error: `Correlation trace for ${id} not found` });
    }

    // 2. Query Audit Log
    const { data: auditEvents } = await supabase
      .from('immutable_audit_log')
      .select('*')
      .or(`subject_id.eq.${id},correlation_id.eq.${id}`)
      .order('created_at', { ascending: true });

    // 3. Query Settlement Record
    const { data: settlement } = await supabase
      .from('settlement_positions')
      .select('*')
      .eq('reference_id', id)
      .maybeSingle();

    res.json({
      correlationId: correlation.correlation_id,
      executionId:   correlation.id,
      state:         correlation.execution_state,
      operationType: correlation.operation_type,
      currency:      correlation.currency,
      amount:        correlation.amount,
      provider:      correlation.provider,
      providerRef:   correlation.provider_reference,
      createdAt:     correlation.created_at,
      completedAt:   correlation.completed_at,
      settlement:    settlement || null,
      auditTrail:    auditEvents || [],
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
