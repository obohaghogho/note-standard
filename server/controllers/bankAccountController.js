const supabase = require('../config/database');
const { encryptPayload, decryptPayload } = require('../utils/encryption');
const { serializeBankAccount } = require('../utils/bankAccountSerializer');
const logger = require('../utils/logger');
const securityMonitor = require('../services/securityMonitor');

// ─── Input Validation Constants ──────────────────────────────
const SUPPORTED_CURRENCIES = new Set(['USD', 'GBP', 'EUR']);
const ACCOUNT_NUMBER_REGEX = /^\d{8,20}$/;

/**
 * FAIL-CLOSED helper — used on every cryptographic and integrity failure.
 * Immediately rejects, escalates, and clears memory.
 */
const failClosed = async (res, reason, context) => {
    await securityMonitor.reportIncident(reason, context);
    return res.status(500).json({
        success: false,
        error: 'Financial operation rejected.',
        code: 'SECURITY_INTEGRITY_FAILURE'
    });
};

/**
 * POST /api/bank-account — Save or update bank account (Fail-Closed, Zero-Trust)
 */
exports.saveBankAccount = async (req, res) => {
    // Extract only from body — never trust implicit references
    let account_number, iban, swift_code, sort_code;

    try {
        const {
            currency,
            account_holder,
            bank_name,
            bank_address,
            payment_schemes,
            account_number: an,
            iban: ib,
            swift_code: sc,
            sort_code: soc,
        } = req.body;

        account_number = an;
        iban = ib;
        swift_code = sc;
        sort_code = soc;

        // ── 1. Strict Input Validation (Early rejection, inside timing bucket) ──
        if (!currency || !SUPPORTED_CURRENCIES.has(currency.toUpperCase())) {
            return res.status(400).json({ success: false, error: 'Unsupported currency.', code: 'INVALID_CURRENCY' });
        }
        if (!account_number || !ACCOUNT_NUMBER_REGEX.test(account_number)) {
            return res.status(400).json({ success: false, error: 'Invalid account number format.', code: 'INVALID_ACCOUNT_NUMBER' });
        }
        if (!account_holder || typeof account_holder !== 'string' || account_holder.length < 2) {
            return res.status(400).json({ success: false, error: 'Invalid account holder.', code: 'INVALID_HOLDER' });
        }

        // ── 2. Identity from session ONLY ──
        const user_id = req.user.id;

        // ── 3. Construct Sensitive Payload (never stored in logs) ──
        const sensitivePayload = {
            account_number,
            iban: iban || null,
            swift: swift_code || null,
            sort_code: sort_code || null,
            bank_metadata: {
                bank_name: bank_name || null,
                bank_address: bank_address || null,
                payment_schemes: Array.isArray(payment_schemes) ? payment_schemes : []
            }
        };

        // ── 4. Atomic Encryption ──
        let encResult;
        try {
            encResult = encryptPayload(sensitivePayload);
        } catch (encErr) {
            return await failClosed(res, 'ENCRYPTION_FAULT', {
                userId: user_id,
                ip: req.ip,
                details: 'Encryption subsystem failure'
            });
        }

        const { encryptedData, iv, authTag, key_id } = encResult;

        // ── 5. Persistence ──
        const { data, error } = await supabase
            .from('bank_accounts')
            .upsert({
                user_id,
                currency: currency.toUpperCase(),
                account_holder,
                encrypted_payload: encryptedData,
                iv,
                auth_tag: authTag,
                key_id,
                updated_at: new Date()
            }, { onConflict: 'user_id, currency' })
            .select('id, user_id, currency, account_holder, updated_at')
            .single();

        if (error) {
            logger.error('[Bank] Storage fault', { error: error.message });
            return res.status(500).json({ success: false, error: 'Storage failure.', code: 'DB_FAULT' });
        }

        // ── 6. Sanitized Audit (No financial IDs) ──
        await supabase.from('security_audit_logs').insert({
            user_id,
            event_type: 'BANK_ACCOUNT_UPSERT',
            severity: 'INFO',
            payload: { currency: currency.toUpperCase(), action: 'UPSERT' }
        });

        // ── 7. Serialized response — serialize THEN null sensitivePayload ──
        const response = serializeBankAccount(data, sensitivePayload);

        // ── 8. MEMORY SCRUB ──
        account_number = null;
        iban = null;
        swift_code = null;
        sort_code = null;
        sensitivePayload.account_number = null;
        sensitivePayload.iban = null;
        sensitivePayload.swift = null;
        sensitivePayload.sort_code = null;

        return res.status(200).json(response);

    } catch (err) {
        // Scrub on exception path
        account_number = null;
        iban = null;
        swift_code = null;
        sort_code = null;

        logger.error('[Bank] Save failure', { message: err.message });
        return res.status(500).json({ success: false, error: 'Processing failure.', code: 'INTERNAL_ERROR' });
    }
};

/**
 * GET /api/bank-account — Retrieve masked bank account (Fail-Closed)
 */
exports.getBankAccount = async (req, res) => {
    let decrypted = null;

    try {
        const user_id = req.user.id;
        const { currency } = req.query;

        // ── 1. Anti-Aggregation: strict currency required ──
        if (!currency || !SUPPORTED_CURRENCIES.has(currency.toUpperCase())) {
            return res.status(400).json({
                success: false,
                error: 'Valid currency parameter required.',
                code: 'MISSING_CURRENCY_FILTER'
            });
        }

        console.time(`[AUDIT] BankFetch_${user_id}_${currency}`);

        // ── 2. Query with double-anchor (user_id + currency) ──
        const { data, error } = await supabase
            .from('bank_accounts')
            .select('*')
            .eq('user_id', user_id)
            .eq('currency', currency.toUpperCase())
            .maybeSingle();

        if (error) {
            console.timeEnd(`[AUDIT] BankFetch_${user_id}_${currency}`);
            logger.error('[Bank] Retrieval fault', { error: error.message });
            return res.status(500).json({ success: false, error: 'Retrieval failure.', code: 'DB_FAULT' });
        }

        console.timeEnd(`[AUDIT] BankFetch_${user_id}_${currency}`);

        // ── No record: return 200 with null payload (not 404).
        // 404 means the ROUTE doesn't exist; a missing bank account is a normal
        // new-user state. Returning 200 eliminates browser-console noise and
        // avoids the need for validateStatus hacks on the client.
        if (!data) {
            return res.status(200).json({ data: null, found: false });
        }

        console.time(`[AUDIT] BankDecrypt_${user_id}_${currency}`);

        // ── 3. Decrypt — FAIL-CLOSED on any integrity failure ──
        try {
            decrypted = decryptPayload(data.encrypted_payload, data.iv, data.auth_tag, data.key_id);
            console.timeEnd(`[AUDIT] BankDecrypt_${user_id}_${currency}`);
        } catch (integrityErr) {
            console.timeEnd(`[AUDIT] BankDecrypt_${user_id}_${currency}`);
            // HARD FAIL — tamper or corruption detected
            return await failClosed(res, 'INTEGRITY_FAILURE', {
                userId: user_id,
                ip: req.ip,
                details: 'Auth tag mismatch — record may be tampered'
            });
        }

        // ── 4. Serialize (masking only) ──
        const response = serializeBankAccount(data, decrypted);

        // ── 5. MEMORY SCRUB ──
        if (decrypted) {
            decrypted.account_number = null;
            decrypted.iban = null;
            decrypted.swift = null;
            decrypted.sort_code = null;
        }
        decrypted = null;

        return res.status(200).json(response);

    } catch (err) {
        if (decrypted) { decrypted = null; }

        if (err.message?.includes('SECURITY_CRITICAL')) {
            await securityMonitor.reportIncident('INTEGRITY_FAILURE', {
                userId: req.user?.id,
                ip: req.ip,
                details: err.message
            });
        }

        logger.error('[Bank] General retrieval failure', { message: err.message });
        return res.status(500).json({ success: false, error: 'System fault.', code: 'INTERNAL_ERROR' });
    }
};

/**
 * GET /api/bank-account/admin/:userId — Admin masked read (Isolated model)
 */
exports.adminGetBankAccount = async (req, res) => {
    let decrypted = null;

    try {
        const { userId } = req.params;
        const { currency } = req.query;

        if (!currency || !SUPPORTED_CURRENCIES.has(currency.toUpperCase())) {
            return res.status(400).json({ success: false, error: 'Currency filter required.', code: 'MISSING_CURRENCY_FILTER' });
        }

        const { data, error } = await supabase
            .from('bank_accounts')
            .select('*')
            .eq('user_id', userId)
            .eq('currency', currency.toUpperCase())
            .maybeSingle();

        if (error) {
            logger.error('[Bank] Admin retrieval fault', { error: error.message });
            return res.status(500).json({ success: false, error: 'Retrieval failure.', code: 'DB_FAULT' });
        }
        if (!data) {
            // Consistent with user-facing endpoint: 200 + null, not 404
            return res.status(200).json({ data: null, found: false });
        }

        try {
            decrypted = decryptPayload(data.encrypted_payload, data.iv, data.auth_tag, data.key_id);
        } catch (integrityErr) {
            return await failClosed(res, 'ADMIN_INTEGRITY_FAILURE', {
                userId: req.user?.id,
                ip: req.ip,
                details: 'Admin path decryption integrity failure'
            });
        }

        // Admin gets SAME masked view — never raw
        const response = serializeBankAccount(data, decrypted);
        if (decrypted) { decrypted = null; }

        return res.status(200).json(response);

    } catch (err) {
        if (decrypted) { decrypted = null; }
        return res.status(500).json({ success: false, error: 'Internal access error.', code: 'INTERNAL_ERROR' });
    }
};
