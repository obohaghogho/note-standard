'use strict';

/**
 * server/services/settlement/AnchorBankingProviderV1.js
 * =======================================================
 * Enterprise Versioned Banking Adapter (v1) for Anchor BaaS Virtual Accounts.
 */

const IBankingProvider = require('./IBankingProvider');
const logger = require('../../utils/logger');
const anchorService = require('../anchorService');
const supabase = require('../../config/database');

class AnchorBankingProviderV1 extends IBankingProvider {
  constructor() {
    super();
    this.version = 'v1';
    this.providerId = 'anchor';
  }

  getProviderId() {
    return 'anchor';
  }

  getVersion() {
    return this.version;
  }

  getCapabilities() {
    return {
      providerId: 'anchor',
      version: 'v1',
      name: 'Anchor BaaS Virtual Accounts',
      supportedCurrencies: ['NGN', 'USD'],
      supportsVirtualAccounts: true,
      supportsBankTransfer: true,
      supportsCards: false,
      supportsACH: false,
      supportsWire: false,
      supportsSWIFT: false,
      supportsWebhook: true,
    };
  }

  async createDepositInstructions({ currency = 'NGN', rail = 'BANK_TRANSFER', userId }) {
    const curr = String(currency).toUpperCase();
    
    // Fetch or provision user virtual account on Anchor
    let account = null;
    try {
      const { data: existing } = await supabase
        .from('dedicated_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('provider', 'anchor')
        .eq('currency', curr)
        .maybeSingle();

      if (existing) {
        account = existing;
      } else {
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', userId).single();
        const email = profile?.email || `${userId}@notestandard.com`;
        account = await anchorService.createVirtualAccount({
          userId,
          email,
          firstName: profile?.first_name || profile?.username || 'User',
          lastName: profile?.last_name || 'Customer',
          phone: profile?.phone
        });
      }
    } catch (err) {
      logger.warn(`[AnchorBankingProviderV1] Virtual account lookup/creation warning: ${err.message}`);
    }

    const bankName = account?.bank_name || account?.bankName || '9 Payment Service Bank';
    const accountNumber = account?.account_number || account?.accountNumber || '';
    const accountHolder = account?.account_name || account?.accountName || 'NoteStandard User';
    const refCode = `ANC_${userId.substring(0, 8)}_${Date.now().toString(36)}`;

    return {
      session_id: refCode,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      provider: {
        name: 'ANCHOR',
        bank_partner: bankName
      },
      account: {
        holder: accountHolder,
        number: accountNumber,
        bank_name: bankName,
        bank_code: '101',
        type: 'Virtual Account'
      },
      reference: {
        code: refCode,
        persistent: true
      },
      copy_payload: {
        all: `Bank: ${bankName}\nAccount Name: ${accountHolder}\nAccount Number: ${accountNumber}`,
        bank_name: bankName,
        account_number: accountNumber,
        account_name: accountHolder,
        reference: refCode
      },
      estimated_time: 'Instant to several minutes',
      notices: [
        `Transfer ${curr} only to this dedicated bank account.`,
        'Deposits to this account are automatically credited to your wallet.'
      ]
    };
  }

  async getIncomingTransfers(params = {}) {
    return [];
  }

  async verifyWebhook(headers, payload) {
    const AnchorProvider = require('../payment/providers/AnchorProvider');
    const instance = new AnchorProvider();
    return instance.verifyWebhookSignature(headers, payload);
  }

  async getBalance(currency = 'NGN') {
    const AnchorProvider = require('../payment/providers/AnchorProvider');
    const instance = new AnchorProvider();
    return await instance.balanceInquiry(currency);
  }

  async healthCheck() {
    return await anchorService.getHealthStatus();
  }
}

module.exports = AnchorBankingProviderV1;
