/**
 * Fincra Integration — Bank Account & BVN Verification
 * ──────────────────────────────────────────────────────
 * Resolves bank account names (NIP enquiry) and optionally verifies BVN.
 *
 * SAFETY:
 *   - BVN is optional and never forced on existing users.
 *   - Existing NoteStandard users continue working regardless of KYC status.
 */

const { getFincraClient }   = require("./client");
const { recordFincraAudit } = require("./audit");
const logger = require("../../utils/logger");

/**
 * Verify a bank account and resolve the account holder name.
 * Must be called before every withdrawal to confirm the destination.
 *
 * @param {object} params
 * @param {string} params.accountNumber
 * @param {string} params.bankCode
 * @param {string} params.currency     - Default NGN
 * @param {string|null} params.userId  - For audit logging
 * @returns {object} { accountName, accountNumber, bank }
 */
async function verifyBankAccount({ accountNumber, bankCode, currency = "NGN", userId = null }) {
  const { instance, businessId } = getFincraClient();

  await recordFincraAudit({
    action: "BANK_ACCOUNT_RESOLUTION_ATTEMPT",
    userId,
    details: { accountNumber, bankCode, currency },
  });

  const res = await instance.post("/core/accounts/resolve", {
    accountNumber,
    bankCode,
    type: "nuban",
    business: businessId,
  });

  const data = res.data?.data || res.data;

  if (!data || !data.accountName) {
    throw new Error("Bank account resolution returned empty account name.");
  }

  await recordFincraAudit({
    action: "BANK_ACCOUNT_RESOLUTION_SUCCESS",
    userId,
    details: {
      accountNumber: data.accountNumber || accountNumber,
      accountName:   data.accountName,
      bankCode,
    },
  });

  logger.info(`[Fincra/verification] Bank account resolved: ${data.accountName} (${accountNumber})`);

  return {
    accountName:   data.accountName,
    accountNumber: data.accountNumber || accountNumber,
    bank:          data.bank || { code: bankCode },
  };
}

/**
 * Optional BVN verification. Must NEVER be mandatory for existing users.
 *
 * @param {object} params
 * @param {string} params.bvn
 * @param {string} params.userId
 * @returns {object} BVN verification result
 */
async function verifyBVN({ bvn, userId }) {
  const { instance, businessId } = getFincraClient();

  await recordFincraAudit({ action: "BVN_VERIFICATION_ATTEMPT", userId, details: { bvnMasked: bvn.slice(0, 3) + "***" } });

  const res = await instance.post("/core/bvn-verification", {
    bvn,
    business: businessId,
  });

  const data = res.data?.data || res.data;

  await recordFincraAudit({ action: "BVN_VERIFICATION_RESULT", userId, details: { status: data?.status } });
  logger.info(`[Fincra/verification] BVN verification result for user ${userId}: ${data?.status}`);

  return data;
}

module.exports = { verifyBankAccount, verifyBVN };
