/**
 * Centralized Serialization/Masking Utility for Bank Accounts.
 * This is the ONLY trusted place where financial data masking occurs.
 */

/**
 * Masking rules:
 * - account_number -> ****XXXX
 * - IBAN -> last 4 digits (e.g. ****5582)
 * - SWIFT -> Never exposed
 * - Sort Code -> Never exposed
 */
const maskValue = (value, lastN = 4) => {
    if (!value) return null;
    const cleanValue = value.replace(/\s+/g, '');
    return `****${cleanValue.slice(-lastN)}`;
};

/**
 * Serializes a bank account record for HTTP responses.
 * @param {object} account - The raw DB record
 * @param {object} decryptedPayload - The decrypted sensitive payload
 * @returns {object} Sanitized/Masked account object
 */
const serializeBankAccount = (account, decryptedPayload) => {
    if (!decryptedPayload) return null;

    return {
        id: account.id,
        user_id: account.user_id, // Metadata is OK
        currency: account.currency,
        account_holder: account.account_holder,
        account_number: maskValue(decryptedPayload.account_number),
        iban_last4: decryptedPayload.iban ? decryptedPayload.iban.slice(-4) : null,
        bank_name: decryptedPayload.bank_metadata?.bank_name || 'Unknown Bank',
        payment_schemes: decryptedPayload.bank_metadata?.payment_schemes || [],
        settlement_info: account.settlement_time || "1–3 business days", // Non-sensitive metadata
        updated_at: account.updated_at
    };
};

module.exports = {
    serializeBankAccount,
    maskValue
};
