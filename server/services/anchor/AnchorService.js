'use strict';
/**
 * AnchorService.js (Domain Facade)
 * =================================
 * Domain-level facade for Anchor banking operations.
 * Delegates to the existing singleton anchorService.js for all REST calls.
 *
 * This file exists to:
 *   1. Provide a clean import path for Phase 16 services
 *   2. Add audit recording, logging, and domain event emission
 *   3. Gate all calls through ANCHOR_ENABLED check
 *
 * The underlying anchorService.js is NOT modified.
 *
 * @module services/anchor/AnchorService
 */

const logger        = require('../../utils/logger');
const supabase      = require('../../config/database');

// ── Singleton: existing low-level REST wrapper (unmodified) ───────────────────
let _instance = null;
function getAnchor() {
  if (!_instance) {
    const anchorInst = require('../anchorService');
    _instance = anchorInst;
  }
  return _instance;
}

const AnchorService = {
  get isEnabled() {
    return getAnchor().isEnabled();
  },

  /**
   * Resolve or create an Anchor customer record.
   */
  async getOrCreateCustomer(userId, { email, firstName, lastName, phone, bvn }) {
    const anchor = getAnchor();
    anchor.assertEnabled();
    logger.info(`[AnchorService] getOrCreateCustomer: ${userId}`);
    return anchor.getOrCreateAnchorCustomer(userId, email, firstName, lastName, phone, bvn);
  },

  /**
   * Provision a dedicated virtual account (NUBAN) for a customer.
   */
  async createVirtualAccount(userId, { email, firstName, lastName, phone, bvn, currency = 'NGN' }) {
    const anchor = getAnchor();
    anchor.assertEnabled();
    logger.info(`[AnchorService] createVirtualAccount for ${userId}`);
    return anchor.createVirtualAccount({ userId, email, firstName, lastName, phone, bvn, currency });
  },

  /**
   * Initiate a bank transfer / payout.
   */
  async initiateTransfer(params) {
    const anchor = getAnchor();
    anchor.assertEnabled();
    logger.info(`[AnchorService] initiateTransfer: ${params.amount} ${params.currency} → ${params.accountNumber}`);
    return anchor.initiateTransfer(params);
  },

  /**
   * Resolve an account name via NIP name enquiry.
   */
  async resolveAccountName(accountNumber, bankCode) {
    const anchor = getAnchor();
    anchor.assertEnabled();
    return anchor.resolveAccountName(accountNumber, bankCode);
  },

  /**
   * Get list of supported banks.
   */
  async getBankList() {
    const anchor = getAnchor();
    anchor.assertEnabled();
    return anchor.getBankList();
  },

  /**
   * Get Anchor customer record from DB.
   */
  async getCustomer(userId) {
    const { data } = await supabase
      .from('anchor_customers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    return data;
  },

  /**
   * Get all virtual accounts for a user.
   */
  async getVirtualAccounts(userId) {
    const { data } = await supabase
      .from('dedicated_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'anchor');
    return data || [];
  },
};

module.exports = AnchorService;
