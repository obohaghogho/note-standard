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

const PLATFORM_SETTLEMENT_NUBANS = [
  '6179630721', '6175916799', '6177724635', '6172662064', '6171397167', '6170660293', '6172312778'
];
const PLATFORM_MERCHANT_CUSTOMER_ID = '1784719040852722-anc_bus_cst';

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

      // Validate existing account before using it
      const isValidExisting = existing?.account_number
        && /^\d{10}$/.test(existing.account_number)
        && !existing.bank_name?.toUpperCase().includes('PROVIDUS')
        && !PLATFORM_SETTLEMENT_NUBANS.includes(String(existing.account_number).trim())
        && !existing.account_name?.toUpperCase().includes('JOSSY DIGITAL')
        && existing.provider_customer_code !== PLATFORM_MERCHANT_CUSTOMER_ID;

      if (existing && isValidExisting) {
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
      // Propagate API unavailability or account rejection so the router can fall back to Fincra
      if (
        err.code === 'ANCHOR_API_UNAVAILABLE' || err.message?.includes('ANCHOR_API_UNAVAILABLE') ||
        err.code === 'ANCHOR_NO_VALID_ACCOUNT' || err.message?.includes('ANCHOR_NO_VALID_ACCOUNT')
      ) {
        throw err;
      }
      logger.warn(`[AnchorBankingProviderV1] Virtual account lookup/creation warning: ${err.message}`);
    }

    const bankName = account?.bank_name || account?.bankName || '9 Payment Service Bank';
    const accountNumber = account?.account_number || account?.accountNumber || '';
    const accountHolder = account?.account_name || account?.accountName || 'NoteStandard User';

    // Don't return deposit instructions with invalid/empty account numbers or platform NUBANs
    if (!accountNumber || !/^\d{10}$/.test(accountNumber) || PLATFORM_SETTLEMENT_NUBANS.includes(accountNumber)) {
      const err = new Error('ANCHOR_NO_VALID_ACCOUNT: No valid Anchor virtual account available. Please use Fincra GTBank transfer.');
      err.code = 'ANCHOR_NO_VALID_ACCOUNT';
      throw err;
    }

    const refCode = `ANC_${userId.substring(0, 8)}_${Date.now().toString(36)}`;
    const is9psb = bankName.toUpperCase().includes('9') || bankName.toUpperCase().includes('PAYMENT SERVICE');
    const bankCode = is9psb ? '120001' : '120001';

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
        bank_code: bankCode,
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
