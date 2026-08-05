'use strict';

/**
 * treasuryController.js
 * =====================
 * API Controller exposing HTTP endpoints for the Enterprise Treasury & Liquidity Platform.
 */

const enterpriseTreasuryEngine = require('../services/treasury/EnterpriseTreasuryEngine');
const liquidityPredictionEngine = require('../services/treasury/LiquidityPredictionEngine');
const GreyDailyLimitService = require('../services/treasury/GreyDailyLimitService');
const ReconciliationEngine = require('../services/treasury/ReconciliationEngine');
const WithdrawalWorkflowService = require('../services/treasury/WithdrawalWorkflowService');
const DepositInstructionService = require('../services/treasury/DepositInstructionService');
const UnknownDepositService = require('../services/treasury/UnknownDepositService');
const logger = require('../utils/logger');

exports.getOverview = async (req, res) => {
  try {
    const overview = await enterpriseTreasuryEngine.getDashboardOverview();
    const greyDailyCapacity = await GreyDailyLimitService.checkSettlementCapacity(0, 'USD');

    res.status(200).json({ 
      success: true, 
      data: {
        ...overview,
        greyDailyCapacity
      } 
    });
  } catch (err) {
    logger.error(`[treasuryController] getOverview error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getDepositInstructions = async (req, res) => {
  try {
    const currency = req.query.currency || 'USD';
    const rail = req.query.rail || 'ACH';
    const result = await DepositInstructionService.getDepositInstructions({
      currency,
      rail,
      userId: req.user.id
    });
    res.status(200).json(result);
  } catch (err) {
    logger.error(`[treasuryController] getDepositInstructions error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getUnallocatedDeposits = async (req, res) => {
  try {
    const list = await UnknownDepositService.getPendingReviews();
    res.status(200).json({ success: true, data: list });
  } catch (err) {
    logger.error(`[treasuryController] getUnallocatedDeposits error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.assignUnallocatedDeposit = async (req, res) => {
  try {
    const { unallocatedId, userId } = req.body;
    if (!unallocatedId || !userId) {
      return res.status(400).json({ success: false, error: 'unallocatedId and userId are required' });
    }
    const result = await UnknownDepositService.assignUser({
      unallocatedId,
      userId,
      adminId: req.user.id
    });
    res.status(200).json(result);
  } catch (err) {
    logger.error(`[treasuryController] assignUnallocatedDeposit error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getGreyDailyLimit = async (req, res) => {
  try {
    const capacity = await GreyDailyLimitService.checkSettlementCapacity(0, 'USD');
    res.status(200).json({ success: true, data: capacity });
  } catch (err) {
    logger.error(`[treasuryController] getGreyDailyLimit error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.getPredictiveLiquidity = async (req, res) => {
  try {
    const provider = req.query.provider || 'GREY';
    const currency = req.query.currency || 'USD';
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
    const report = await ReconciliationEngine.runReconciliationBatch(24);
    res.status(200).json({ success: true, data: report });
  } catch (err) {
    logger.error(`[treasuryController] triggerReconciliation error: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.processPayout = async (req, res) => {
  try {
    const { walletId, amount, currency, bankCode, accountNumber, accountName, idempotencyKey } = req.body;
    const result = await WithdrawalWorkflowService.processWithdrawal({
      userId: req.user.id,
      walletId,
      amount,
      currency,
      bankCode,
      accountNumber,
      accountName,
      idempotencyKey
    });
    res.status(200).json({ success: true, data: result });
  } catch (err) {
    logger.error(`[treasuryController] processPayout error: ${err.message}`);
    res.status(err.statusCode || 500).json({ success: false, error: err.message });
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
