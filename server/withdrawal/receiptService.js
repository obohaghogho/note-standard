/**
 * Signed PDF Receipt Generator & Public Verification Service
 * ─────────────────────────────────────────────────────────────
 * Produces audit-verifiable PDF receipt data & exposes public receipt verification.
 */

const crypto   = require("crypto");
const supabase = require("../config/database");
const logger   = require("../utils/logger");

const RECEIPT_SECRET = process.env.RECEIPT_SIGNING_SECRET || "notestandard_receipt_secret_key_2026";

/**
 * Generate a digital signature for a withdrawal receipt.
 */
function generateReceiptSignature(reference, amount, userId, timestamp) {
  const payload = `${reference}:${amount}:${userId}:${timestamp}`;
  return crypto.createHmac("sha256", RECEIPT_SECRET).update(payload).digest("hex");
}

/**
 * Fetch and verify receipt metadata by transaction ID or reference.
 * Used by public verification endpoint: GET /api/v1/withdrawals/:id/verify
 */
async function verifyReceipt(transactionRef) {
  const { data: tx, error } = await supabase
    .from("fincra_transactions")
    .select("*, profile:profiles(email, full_name, username)")
    .or(`reference.eq.${transactionRef},withdrawal_reference.eq.${transactionRef},fincra_reference.eq.${transactionRef}`)
    .maybeSingle();

  if (error || !tx) {
    return { valid: false, message: "Receipt or transaction reference not found." };
  }

  const timestamp = new Date(tx.created_at).getTime();
  const signature = generateReceiptSignature(tx.reference, tx.amount, tx.user_id, timestamp);

  return {
    valid: true,
    verification: {
      transactionId:        tx.id,
      withdrawalReference:  tx.reference,
      fincraReference:       tx.fincra_reference || "N/A",
      traceId:              tx.trace_id || "N/A",
      correlationId:        tx.correlation_id || "N/A",
      amount:               tx.amount,
      fee:                  tx.fee || 0,
      currency:             tx.currency,
      status:               tx.status,
      bankCode:             tx.bank_code,
      accountNumberMasked: tx.account_number_masked,
      accountName:          tx.account_name,
      sender:               tx.profile?.full_name || tx.profile?.username || tx.profile?.email || "NoteStandard User",
      issuedAt:             tx.created_at,
      digitalSignature:     signature,
    },
  };
}

module.exports = { generateReceiptSignature, verifyReceipt };
