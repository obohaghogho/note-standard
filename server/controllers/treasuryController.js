'use strict';

/**
 * treasuryController.js
 * =====================
 * API Controller exposing HTTP endpoints for the Enterprise Treasury & Liquidity Platform.
 *
 * Endpoints:
 *   - GET  /api/treasury/overview             - Complete platform status & telemetry
 *   - GET  /api/treasury/predictive-liquidity - Predictive liquidity forecasts
 *   - GET  /api/treasury/ai-risk              - AI intelligence & risk report
 *   - POST /api/treasury/rebalance            - Trigger auto-rebalance check
 *   - POST /api/treasury/reconcile            - Trigger automated checksummed reconciliation
 *   - POST /api/treasury/fund-provider        - Fund provider from Treasury Vault
 *
 * @module controllers/treasuryController
 */

const enterpriseTreasuryEngine = require('../services/treasury/EnterpriseTreasuryEngine');
const liquidityPredictionEngine = require('../services/treasury/LiquidityPredictionEngine');
const logger = require('../utils/logger');

exports.getOverview = async (req, res) => {
  try {
    const overview = await enterpriseTreasuryEngine.getDashboardOverview();
    res.status(200).json({ success: true, data: overview });
  } catch (err) {
    logger.error(`[treasuryController] getOverview error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getPredictiveLiquidity = async (req, res) => {
  try {
    const provider = req.query.provider || 'FINCRA';
    const currency = req.query.currency || 'NGN';
    const forecast = await liquidityPredictionEngine.predictLiquidity(provider, currency, 60);
    res.status(200).json({ success: true, data: forecast });
  } catch (err) {
    logger.error(`[treasuryController] getPredictiveLiquidity error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getAIRiskReport = async (req, res) => {
  try {
    const report = await enterpriseTreasuryEngine.evaluatePlatformAIRisk();
    res.status(200).json({ success: true, data: report });
  } catch (err) {
    logger.error(`[treasuryController] getAIRiskReport error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.triggerRebalance = async (req, res) => {
  try {
    const result = await enterpriseTreasuryEngine.runAutoRebalance();
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    logger.error(`[treasuryController] triggerRebalance error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.triggerReconciliation = async (req, res) => {
  try {
    const report = await enterpriseTreasuryEngine.runReconciliation();
    res.status(200).json({ success: true, data: report });
  } catch (err) {
    logger.error(`[treasuryController] triggerReconciliation error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.fundProvider = async (req, res) => {
  try {
    const { providerId, currency, amount, reason } = req.body;
    if (!providerId || !currency || !amount) {
      return res.status(400).json({ success: false, error: 'providerId, currency, and amount are required' });
    }
    const result = await enterpriseTreasuryEngine.fundProvider({ providerId, currency, amount, reason });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    logger.error(`[treasuryController] fundProvider error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};
