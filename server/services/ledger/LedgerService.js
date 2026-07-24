/**
 * LedgerService.js
 * ================
 * Double-entry accounting ledger — the financial source of truth.
 * Every movement of money creates an immutable ledger entry first.
 * Wallet balances are always derived from the ledger, never overwrite it.
 *
 * Accounting Identity: Σ(debits) = Σ(credits)
 *
 * NoteStandard Financial Platform v4
 */

const { v4: uuidv4 } = require('uuid');
const supabase = require('../../config/database');
const logger = require('../../utils/logger');
const AuditLogger = require('../audit/AuditLogger');
const ConfigService = require('../ConfigService');

class LedgerService {
  /**
   * Posts a matched debit + credit pair atomically.
   * This is the ONLY way money should be moved in the system.
   *
   * @param {Object} params
   * @param {string} params.correlationId     - Links debit + credit pair (same transaction)
   * @param {string} params.debitWalletId     - Wallet being debited
   * @param {string} params.creditWalletId    - Wallet being credited
   * @param {number} params.amount            - Amount in currency unit
   * @param {string} params.currency          - Currency being moved
   * @param {string} params.type              - e.g. 'DEPOSIT', 'WITHDRAWAL', 'REFUND', 'TRANSFER', 'FEE'
   * @param {string} [params.reference]       - Transaction reference
   * @param {string} [params.description]
   * @param {Object} [params.metadata]
   * @param {string} [params.userId]
   * @param {string} [params.provider]
   * @param {string} [params.requestedCurrency]  - Original user-requested currency (if different)
   * @param {number} [params.requestedAmount]
   * @param {number} [params.exchangeRate]
   * @returns {Promise<{ debitEntry: Object, creditEntry: Object }>}
   */
  async postDoubleEntry(params) {
    const {
      correlationId = uuidv4(),
      debitWalletId,
      creditWalletId,
      amount,
      currency,
      type,
      reference,
      description,
      metadata = {},
      userId,
      provider,
      requestedCurrency,
      requestedAmount,
      exchangeRate,
    } = params;

    const ledgerCurrency = ConfigService.get('BUSINESS_LEDGER_CURRENCY') || 'USD';
    const now = new Date().toISOString();

    const baseFields = {
      correlation_id:       correlationId,
      type,
      currency,
      amount,
      reference:            reference || null,
      description:          description || null,
      provider:             provider || null,
      user_id:              userId || null,
      requested_currency:   requestedCurrency || currency,
      requested_amount:     requestedAmount ?? amount,
      exchange_rate:        exchangeRate ?? 1,
      ledger_currency:      ledgerCurrency,
      metadata,
      created_at:           now,
    };

    const debitEntry = { ...baseFields, wallet_id: debitWalletId,  direction: 'DEBIT'  };
    const creditEntry = { ...baseFields, wallet_id: creditWalletId, direction: 'CREDIT' };

    const { data, error } = await supabase
      .from('ledger_entries')
      .insert([debitEntry, creditEntry])
      .select();

    if (error) {
      logger.error(`[LedgerService] Failed to post double-entry: ${error.message}`, { correlationId });
      throw new Error(`LedgerService: Failed to post double-entry — ${error.message}`);
    }

    logger.info(`[LedgerService] Double-entry posted: ${correlationId} | ${currency} ${amount} | type=${type}`);

    await AuditLogger.success({
      action:            `ledger.${type.toLowerCase()}`,
      userId,
      service:           'LedgerService',
      provider,
      reference,
      requestedCurrency: requestedCurrency || currency,
      requestedAmount:   requestedAmount ?? amount,
      gatewayCurrency:   currency,
      gatewayAmount:     amount,
      exchangeRate:      exchangeRate ?? 1,
      metadata,
    });

    return {
      debitEntry:  data[0],
      creditEntry: data[1],
      correlationId,
    };
  }

  /**
   * Posts a single-sided ledger entry (e.g. gateway funding with no offsetting wallet debit).
   * Use sparingly — only for external money ingress/egress.
   */
  async postSingleEntry(params) {
    const {
      walletId,
      direction, // 'DEBIT' | 'CREDIT'
      amount,
      currency,
      type,
      reference,
      description,
      metadata = {},
      userId,
      provider,
      requestedCurrency,
      requestedAmount,
      exchangeRate,
    } = params;

    const correlationId = uuidv4();
    const ledgerCurrency = ConfigService.get('BUSINESS_LEDGER_CURRENCY') || 'USD';

    const entry = {
      correlation_id:     correlationId,
      wallet_id:          walletId,
      direction,
      type,
      currency,
      amount,
      reference:          reference || null,
      description:        description || null,
      provider:           provider || null,
      user_id:            userId || null,
      requested_currency: requestedCurrency || currency,
      requested_amount:   requestedAmount ?? amount,
      exchange_rate:      exchangeRate ?? 1,
      ledger_currency:    ledgerCurrency,
      metadata,
      created_at:         new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('ledger_entries')
      .insert([entry])
      .select()
      .single();

    if (error) {
      logger.error(`[LedgerService] Failed to post single entry: ${error.message}`, { correlationId });
      throw new Error(`LedgerService: Failed to post single entry — ${error.message}`);
    }

    logger.info(`[LedgerService] Single-entry posted: ${correlationId} | ${direction} ${currency} ${amount}`);
    return { entry: data, correlationId };
  }

  /**
   * Rebuilds a wallet's balance from the ledger.
   * Use this whenever a wallet is suspected to be inconsistent.
   * @param {string} walletId
   * @returns {Promise<{ balance: number, reserved: number, available: number }>}
   */
  async rebuildWalletBalance(walletId) {
    const { data, error } = await supabase
      .from('ledger_entries')
      .select('direction, amount, type')
      .eq('wallet_id', walletId);

    if (error) throw new Error(`LedgerService: rebuildWalletBalance failed — ${error.message}`);

    let totalBalance = 0;
    let reserved = 0;

    for (const row of data) {
      const amt = Number(row.amount);
      if (row.direction === 'CREDIT') {
        totalBalance += amt;
      } else if (row.direction === 'DEBIT') {
        totalBalance -= amt;
      }
      if (row.type === 'HOLD' && row.direction === 'DEBIT') {
        reserved += amt;
      }
      if (row.type === 'HOLD_RELEASE' && row.direction === 'CREDIT') {
        reserved -= amt;
      }
    }

    const available = totalBalance - reserved;
    logger.info(`[LedgerService] Rebuilt wallet ${walletId}: total=${totalBalance} reserved=${reserved} available=${available}`);
    return { balance: totalBalance, reserved, available };
  }

  /**
   * Verifies double-entry integrity (debit sum == credit sum) for a correlationId.
   * @param {string} correlationId
   * @returns {Promise<boolean>}
   */
  async verifyBalance(correlationId) {
    const { data, error } = await supabase
      .from('ledger_entries')
      .select('direction, amount')
      .eq('correlation_id', correlationId);

    if (error || !data?.length) return false;

    let net = 0;
    for (const row of data) {
      net += row.direction === 'CREDIT' ? Number(row.amount) : -Number(row.amount);
    }
    const balanced = Math.abs(net) < 0.00001;
    if (!balanced) {
      logger.warn(`[LedgerService] Imbalanced double-entry detected: ${correlationId} | net=${net}`);
    }
    return balanced;
  }
}

module.exports = new LedgerService();
