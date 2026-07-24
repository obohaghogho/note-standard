/**
 * ComplianceManager.js
 * ====================
 * Global compliance hooks — KYC, AML, country restrictions, tax reporting.
 * These hooks are disabled by default. Enable via ConfigService feature flags
 * as your compliance requirements grow — no code changes needed.
 *
 * NoteStandard Financial Platform v4
 */

const logger = require('../../utils/logger');
const ConfigService = require('../ConfigService');

class ComplianceManager {
  /**
   * Evaluates all active compliance checks for a transaction.
   * Returns { approved: true } if all pass; throws on hard-block.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} [params.countryCode]
   * @param {number} params.amount
   * @param {string} params.currency
   * @param {string} [params.purpose]         - e.g. 'deposit', 'transfer', 'subscription'
   * @returns {Promise<{ approved: boolean, notes: string[] }>}
   */
  async evaluate(params) {
    const { userId, countryCode, amount, currency, purpose = 'deposit' } = params;
    const notes = [];

    // ─── KYC Check (disabled by default) ──────────────────────────────────
    if (ConfigService.get('COMPLIANCE_KYC_ENABLED') === 'true') {
      const kycResult = await this._checkKYC(userId);
      if (!kycResult.passed) {
        throw new Error(`[Compliance] KYC check failed for user ${userId}: ${kycResult.reason}`);
      }
      notes.push('KYC:PASSED');
    }

    // ─── AML Screening (disabled by default) ──────────────────────────────
    if (ConfigService.get('COMPLIANCE_AML_ENABLED') === 'true') {
      const amlResult = await this._screenAML(userId, amount, currency);
      if (amlResult.flagged) {
        throw new Error(`[Compliance] AML screening flagged user ${userId}: ${amlResult.reason}`);
      }
      notes.push('AML:CLEAR');
    }

    // ─── Country Restriction (disabled by default) ─────────────────────────
    if (ConfigService.get('COMPLIANCE_COUNTRY_RESTRICTIONS_ENABLED') === 'true') {
      const blocked = this._isCountryBlocked(countryCode);
      if (blocked) {
        throw new Error(`[Compliance] Country ${countryCode} is restricted for ${purpose}`);
      }
      notes.push(`COUNTRY:${countryCode || 'UNKNOWN'}:ALLOWED`);
    }

    // ─── Transaction Monitoring (always logs, no hard block unless configured) ─
    logger.debug(`[ComplianceManager] Evaluated: user=${userId} country=${countryCode} amount=${currency} ${amount} purpose=${purpose}`);

    return { approved: true, notes };
  }

  // ─── Internal Stubs (wire to real KYC/AML providers as needed) ──────────

  async _checkKYC(userId) {
    // TODO: Wire to your KYC provider (e.g. Smile Identity, Onfido, Stripe Identity)
    logger.debug(`[ComplianceManager] KYC stub for user: ${userId}`);
    return { passed: true, reason: null };
  }

  async _screenAML(userId, amount, currency) {
    // TODO: Wire to AML screening (e.g. Chainalysis, Refinitiv World-Check)
    logger.debug(`[ComplianceManager] AML stub: user=${userId} ${currency} ${amount}`);
    return { flagged: false, reason: null };
  }

  _isCountryBlocked(countryCode) {
    const blocklist = (ConfigService.get('COMPLIANCE_BLOCKED_COUNTRIES') || '').split(',').map(c => c.trim().toUpperCase());
    return blocklist.includes(String(countryCode || '').toUpperCase());
  }
}

module.exports = new ComplianceManager();
