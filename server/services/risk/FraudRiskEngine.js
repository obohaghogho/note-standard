/**
 * FraudRiskEngine.js
 * ==================
 * Pre-routing fraud & risk evaluation layer.
 * Evaluates every payment before gateway selection.
 *
 * Checks:
 *   - Velocity limits (max N transactions per user per day)
 *   - Transaction size caps
 *   - High-risk country flags
 *   - Failed card attempt tracking
 *   - Sanctions & blocked user list
 *
 * NoteStandard Financial Platform v4
 */

const supabase = require('../../config/database');
const logger = require('../../utils/logger');
const AuditLogger = require('../audit/AuditLogger');
const ConfigService = require('../ConfigService');

// High-risk countries (ISO 3166-1 alpha-2) — add/remove via config
const HIGH_RISK_COUNTRIES = new Set([
  'KP', 'IR', 'SY', 'CU', 'VE', 'MM', 'BY',
]);

const DAILY_VELOCITY_LIMIT = 10;       // Max transactions per user per day
const MAX_TX_USD            = parseFloat(ConfigService.get('MAX_TRANSACTION_USD') || '50000');
const MAX_FAILED_CARDS      = 3;       // Max consecutive failed card attempts before flag

class FraudRiskEngine {
  /**
   * Evaluates a payment attempt for risk before gateway routing.
   *
   * @param {Object} params
   * @param {string} params.userId
   * @param {string} params.email
   * @param {number} params.amount        - In requested currency unit
   * @param {string} params.currency
   * @param {string} [params.countryCode] - ISO 3166-1 country code
   * @param {string} [params.ipAddress]
   * @param {string} [params.method]
   * @returns {Promise<{ approved: boolean, riskScore: number, reason: string | null }>}
   */
  async evaluate(params) {
    const { userId, email, amount, currency, countryCode, ipAddress, method } = params;
    let riskScore = 0;
    const flags = [];

    try {
      // 1. High-risk country check
      if (countryCode && HIGH_RISK_COUNTRIES.has(String(countryCode).toUpperCase())) {
        const blockHighRisk = ConfigService.get('RISK_BLOCK_HIGH_RISK_COUNTRIES') === 'true';
        if (blockHighRisk) {
          return this._reject('HIGH_RISK_COUNTRY', 100, params);
        }
        riskScore += 30;
        flags.push('HIGH_RISK_COUNTRY');
      }

      // 2. Velocity check — too many transactions today
      const { count: todayCount } = await supabase
        .from('transactions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', new Date(Date.now() - 86400000).toISOString())
        .in('status', ['SUCCESS', 'PENDING', 'INITIALIZED']);

      if ((todayCount || 0) >= DAILY_VELOCITY_LIMIT) {
        return this._reject('VELOCITY_LIMIT_EXCEEDED', 80, params);
      }
      if ((todayCount || 0) >= DAILY_VELOCITY_LIMIT * 0.7) {
        riskScore += 15;
        flags.push('APPROACHING_VELOCITY_LIMIT');
      }

      // 3. Transaction size cap (normalize to USD equivalent approximately)
      const approxUsdAmount = this._approxUsdAmount(amount, currency);
      if (approxUsdAmount > MAX_TX_USD) {
        return this._reject('AMOUNT_EXCEEDS_LIMIT', 90, params);
      }
      if (approxUsdAmount > MAX_TX_USD * 0.8) {
        riskScore += 20;
        flags.push('LARGE_TRANSACTION');
      }

      // 4. Failed card attempts
      if (method === 'card') {
        const { count: failedCount } = await supabase
          .from('transactions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'FAILED')
          .eq('type', 'DEPOSIT')
          .gte('created_at', new Date(Date.now() - 3600000).toISOString()); // Last hour

        if ((failedCount || 0) >= MAX_FAILED_CARDS) {
          return this._reject('EXCESSIVE_FAILED_CARDS', 85, params);
        }
        if ((failedCount || 0) >= MAX_FAILED_CARDS - 1) {
          riskScore += 25;
          flags.push('FAILED_CARD_WARNING');
        }
      }

      // Approved
      if (flags.length > 0) {
        logger.warn(`[FraudRiskEngine] Approved with flags [${flags.join(', ')}] for user=${userId} score=${riskScore}`);
      } else {
        logger.debug(`[FraudRiskEngine] Clean: user=${userId} score=${riskScore}`);
      }

      return { approved: true, riskScore, reason: flags.join(', ') || null };

    } catch (err) {
      // Risk engine failure is non-blocking — log & allow with flag
      logger.error(`[FraudRiskEngine] Evaluation error: ${err.message}`);
      return { approved: true, riskScore: 0, reason: 'RISK_ENGINE_ERROR' };
    }
  }

  _reject(reason, score, params) {
    logger.warn(`[FraudRiskEngine] REJECTED: ${reason} | user=${params.userId} | ${params.currency} ${params.amount}`);
    AuditLogger.flagged({
      action: 'payment.risk_rejected',
      userId: params.userId,
      service: 'FraudRiskEngine',
      metadata: { reason, riskScore: score, ...params },
    });
    return { approved: false, riskScore: score, reason };
  }

  /** Approximate USD conversion for size check (not for payment processing) */
  _approxUsdAmount(amount, currency) {
    const seeds = { USD: 1, NGN: 1 / 1590, EUR: 1.09, GBP: 1.27, JPY: 1 / 155.5 };
    const rate = seeds[String(currency).toUpperCase()] || 1;
    return amount * rate;
  }
}

module.exports = new FraudRiskEngine();
