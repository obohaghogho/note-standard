/**
 * Fincra Integration — Wallet Inquiry Service
 * ─────────────────────────────────────────────
 * Fetches Fincra wallet state, balances, logs, and account statements.
 *
 * IMPORTANT: Fincra wallet balances are NEVER used as NoteStandard user balances.
 * These are provider-side tracking values only, used for reconciliation.
 */

const { getFincraClient }  = require("./client");
const { recordFincraAudit } = require("./audit");
const logger = require("../../utils/logger");

/**
 * List all Fincra wallets for the configured business.
 * Used for admin reconciliation and health monitoring.
 */
async function getFincraWallets() {
  const { instance, businessId } = getFincraClient();
  const res = await instance.get(`/wallets`, { params: { business: businessId } });
  logger.info("[Fincra/wallet] Retrieved wallet list");
  return res.data?.data || res.data || [];
}

/**
 * Get a specific Fincra wallet by wallet ID.
 * @param {string} walletId
 */
async function getFincraWalletById(walletId) {
  const { instance } = getFincraClient();
  const res = await instance.get(`/wallets/${walletId}`);
  return res.data?.data || res.data;
}

/**
 * Get wallet transaction logs.
 * @param {object} params - Optional filters (page, limit, currency)
 */
async function getFincraWalletLogs(params = {}) {
  const { instance, businessId } = getFincraClient();
  const res = await instance.get("/wallets/logs", {
    params: { business: businessId, ...params },
  });
  return res.data?.data || res.data || [];
}

/**
 * Get wallet statement for a currency.
 * @param {string} currency - NGN | USD | EUR
 * @param {object} params   - Optional filters (from, to, page)
 */
async function getFincraWalletStatement(currency, params = {}) {
  const { instance, businessId } = getFincraClient();
  const res = await instance.get("/wallets/logs/statement", {
    params: { business: businessId, currency, ...params },
  });
  return res.data?.data || res.data || [];
}

module.exports = {
  getFincraWallets,
  getFincraWalletById,
  getFincraWalletLogs,
  getFincraWalletStatement,
};
