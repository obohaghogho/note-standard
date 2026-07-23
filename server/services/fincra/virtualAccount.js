/**
 * Fincra Integration — Virtual Account Provisioning
 * ──────────────────────────────────────────────────
 * Provisions dedicated NGN/USD/EUR virtual accounts on Fincra for deposit tracking.
 * Each user gets a dedicated account per currency, stored in fincra_wallet_links.
 *
 * Idempotency: If a user already has a virtual account for a currency, the
 * existing record is returned without creating a new one.
 */

const supabase          = require("../../config/database");
const { getFincraClient } = require("./client");
const { recordFincraAudit } = require("./audit");
const { FINCRA_TX_STATUS, FINCRA_TX_TYPES, FINCRA_CURRENCIES } = require("./constants");
const { FincraApiError } = require("./errors");
const logger = require("../../utils/logger");

/**
 * Provision or retrieve a dedicated Fincra virtual account for a user.
 *
 * @param {object} params
 * @param {string} params.userId      - NoteStandard user UUID
 * @param {string} params.email       - User email
 * @param {string} params.firstName
 * @param {string} params.lastName
 * @param {string} params.currency    - NGN | USD | EUR
 * @returns {object} Virtual account details (account_number, bank_name, etc.)
 */
async function createOrGetFincraVirtualAccount({ userId, email, firstName, lastName, currency = FINCRA_CURRENCIES.NGN }) {
  // ── Idempotency check: return existing record if one exists ──
  const { data: existing } = await supabase
    .from("fincra_wallet_links")
    .select("*")
    .eq("user_id", userId)
    .eq("currency", currency)
    .maybeSingle();

  if (existing && existing.account_number) {
    logger.info(`[Fincra/virtualAccount] Found existing virtual account for user ${userId} (${currency}): ${existing.account_number}`);
    return existing;
  }

  // ── Provision new virtual account from Fincra ──────────────────
  logger.info(`[Fincra/virtualAccount] Provisioning new ${currency} virtual account for user ${userId}`);
  const { instance, businessId } = getFincraClient();

  const payload = {
    currency,
    accountType: "individual",
    KYCInformation: {
      email,
      firstName,
      lastName,
    },
    meansOfId: [],
    attachmentType: "none",
  };

  const res = await instance.post(`/profile/virtual-accounts/requests`, payload);
  const accountData = res.data?.data || res.data;

  if (!accountData) {
    throw new FincraApiError("Fincra returned empty virtual account data", 502);
  }

  // ── Persist to fincra_wallet_links ──────────────────────────────
  const linkRecord = {
    user_id:          userId,
    fincra_wallet_id: accountData.id || accountData.walletId || accountData._id,
    currency,
    account_number:   accountData.accountNumber || accountData.account_number,
    account_name:     accountData.accountName   || accountData.account_name || `${firstName} ${lastName}`,
    bank_name:        accountData.bankName       || accountData.bank_name   || accountData.bank,
    status:           "ACTIVE",
    metadata:         accountData,
  };

  const { data: saved, error } = await supabase
    .from("fincra_wallet_links")
    .upsert(linkRecord, { onConflict: "user_id,currency" })
    .select()
    .single();

  if (error) {
    logger.error(`[Fincra/virtualAccount] Failed to save wallet link: ${error.message}`);
    throw new Error(`Failed to persist Fincra virtual account record: ${error.message}`);
  }

  await recordFincraAudit({
    action: "VIRTUAL_ACCOUNT_PROVISIONED",
    userId,
    details: { currency, accountNumber: linkRecord.account_number, bankName: linkRecord.bank_name },
  });

  logger.info(`[Fincra/virtualAccount] Virtual account provisioned for user ${userId}: ${linkRecord.account_number} (${currency})`);
  return saved;
}

/**
 * Retrieve user's existing Fincra virtual accounts.
 * @param {string} userId
 * @returns {Array} Array of fincra_wallet_links records
 */
async function getUserFincraAccounts(userId) {
  const { data, error } = await supabase
    .from("fincra_wallet_links")
    .select("*")
    .eq("user_id", userId)
    .eq("status", "ACTIVE");

  if (error) throw new Error(error.message);
  return data || [];
}

module.exports = {
  createOrGetFincraVirtualAccount,
  getUserFincraAccounts,
};
