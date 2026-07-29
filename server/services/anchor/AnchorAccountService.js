'use strict';
/**
 * AnchorAccountService.js
 * =======================
 * Virtual account lifecycle, beneficiary management, and account verification.
 * All Anchor account operations go through this service via FinancialOrchestrator.
 *
 * @module services/anchor/AnchorAccountService
 */

const logger       = require('../../utils/logger');
const supabase     = require('../../config/database');
const AnchorService = require('./AnchorService');

const AnchorAccountService = {
  /**
   * Create and provision a virtual account for a user.
   * Delegates to AnchorService → existing anchorService.createVirtualAccount
   */
  async createVirtualAccount(userId, params) {
    logger.info(`[AnchorAccountService] Creating virtual account for ${userId}`);

    // Idempotency: check if account already exists
    const existing = await this.getVirtualAccount(userId, params.currency || 'NGN');
    if (existing) {
      logger.info(`[AnchorAccountService] Virtual account already exists for ${userId}`);
      return existing;
    }

    const account = await AnchorService.createVirtualAccount(userId, params);

    logger.info(`[AnchorAccountService] Virtual account created: ${account.accountNumber} for ${userId}`);
    return account;
  },

  /**
   * Get the virtual account for a user (from DB).
   */
  async getVirtualAccount(userId, currency = 'NGN') {
    const { data } = await supabase
      .from('dedicated_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'anchor')
      .eq('currency', currency)
      .eq('is_active', true)
      .maybeSingle();
    return data || null;
  },

  /**
   * List all virtual accounts for a user.
   */
  async listVirtualAccounts(userId) {
    const { data } = await supabase
      .from('dedicated_accounts')
      .select('*')
      .eq('user_id', userId)
      .eq('provider', 'anchor')
      .order('created_at', { ascending: false });
    return data || [];
  },

  /**
   * Verify a bank account via NIP name enquiry.
   * @returns {{ accountName, accountNumber, bankCode, bankName }}
   */
  async verifyAccount(accountNumber, bankCode) {
    logger.info(`[AnchorAccountService] Verifying account: ${accountNumber}/${bankCode}`);
    const result = await AnchorService.resolveAccountName(accountNumber, bankCode);
    return result;
  },

  /**
   * Get supported banks list from Anchor.
   */
  async getBankList() {
    return AnchorService.getBankList();
  },

  /**
   * Create a beneficiary record (stored locally for reuse).
   */
  async createBeneficiary(userId, params) {
    const { accountNumber, bankCode, accountName, currency = 'NGN', label } = params;

    // Verify before saving
    const verified = await this.verifyAccount(accountNumber, bankCode);

    const { data, error } = await supabase
      .from('anchor_beneficiaries')
      .upsert({
        user_id:        userId,
        account_number: accountNumber,
        bank_code:      bankCode,
        account_name:   accountName || verified?.accountName,
        currency,
        label:          label || accountName || verified?.accountName,
        verified:       Boolean(verified?.accountName),
        updated_at:     new Date().toISOString(),
      }, { onConflict: 'user_id,account_number,bank_code' })
      .select()
      .single();

    if (error) throw new Error(`[AnchorAccountService] Beneficiary save failed: ${error.message}`);
    return data;
  },

  /**
   * List beneficiaries for a user.
   */
  async listBeneficiaries(userId) {
    const { data } = await supabase
      .from('anchor_beneficiaries')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    return data || [];
  },
};

module.exports = AnchorAccountService;
