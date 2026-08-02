'use strict';

/**
 * ChartOfAccountsService.js
 * =========================
 * Service for resolving hierarchical Chart of Accounts entries and code trees.
 */
class ChartOfAccountsService {
  constructor(db) {
    try {
      this.db = db || require('../../config/database');
    } catch (e) {
      this.db = db || null;
    }
  }

  /**
   * Get account by code
   */
  async getByCode(code) {
    if (!code) throw new Error('Chart account code is required');

    // Baseline memory seed fallback for tests/development
    const MEMORY_CHART = {
      '1000': { code: '1000', name: 'Assets', type: 'ASSET', level: 1 },
      '1100': { code: '1100', name: 'Treasury Accounts', type: 'ASSET', level: 2 },
      '1110': { code: '1110', name: 'Treasury NGN Available', type: 'ASSET', level: 3, currency: 'NGN' },
      '1120': { code: '1120', name: 'Treasury USD Available', type: 'ASSET', level: 3, currency: 'USD' },
      '1130': { code: '1130', name: 'Treasury EUR Available', type: 'ASSET', level: 3, currency: 'EUR' },
      '1140': { code: '1140', name: 'Treasury GBP Available', type: 'ASSET', level: 3, currency: 'GBP' },
      '2000': { code: '2000', name: 'Liabilities', type: 'LIABILITY', level: 1 },
      '2100': { code: '2100', name: 'Customer Wallets', type: 'LIABILITY', level: 2 },
      '2110': { code: '2110', name: 'Customer NGN Wallets', type: 'LIABILITY', level: 3, currency: 'NGN' },
      '2120': { code: '2120', name: 'Customer USD Wallets', type: 'LIABILITY', level: 3, currency: 'USD' },
      '2130': { code: '2130', name: 'Customer EUR Wallets', type: 'LIABILITY', level: 3, currency: 'EUR' },
      '2140': { code: '2140', name: 'Customer GBP Wallets', type: 'LIABILITY', level: 3, currency: 'GBP' },
      '3000': { code: '3000', name: 'Revenue', type: 'REVENUE', level: 1 },
      '3100': { code: '3100', name: 'Deposit Fees', type: 'REVENUE', level: 2 },
      '4000': { code: '4000', name: 'Expenses', type: 'EXPENSE', level: 1 },
      '4100': { code: '4100', name: 'Provider Fees', type: 'EXPENSE', level: 2 }
    };

    if (this.db && typeof this.db.query === 'function') {
      try {
        const res = await this.db.query(
          'SELECT * FROM public.chart_of_accounts WHERE code = $1 AND is_active = true',
          [code]
        );
        if (res.rows && res.rows.length > 0) {
          return res.rows[0];
        }
      } catch (err) {
        // Fallback to memory chart if table DB is unmigrated in local test env
      }
    }

    return MEMORY_CHART[code] || null;
  }

  /**
   * Resolve customer wallet chart account for a given currency
   */
  async getCustomerWalletAccount(currency) {
    const codeMap = { NGN: '2110', USD: '2120', EUR: '2130', GBP: '2140' };
    const code = codeMap[currency.toUpperCase()] || '2100';
    return this.getByCode(code);
  }

  /**
   * Resolve treasury available chart account for a given currency
   */
  async getTreasuryAvailableAccount(currency) {
    const codeMap = { NGN: '1110', USD: '1120', EUR: '1130', GBP: '1140' };
    const code = codeMap[currency.toUpperCase()] || '1100';
    return this.getByCode(code);
  }
}

module.exports = ChartOfAccountsService;
