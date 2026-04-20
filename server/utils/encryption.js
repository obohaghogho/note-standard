const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; 
const AUTH_TAG_LENGTH = 16;

/**
 * Multi-Key Registry (Hardened)
 * This enables safe key rotation by supporting multiple active/historical keys.
 * In production, these should be loaded from a Secret Manager.
 */
const KEY_REGISTRY = {
    'v1': Buffer.from(process.env.BANK_ENCRYPTION_KEY, 'hex'),
    // 'v2': Buffer.from(process.env.BANK_ENCRYPTION_KEY_V2, 'hex'), // Example rotation
};

/**
 * The key_id used for ALL new encryptions.
 */
const CURRENT_ACTIVE_KEY_ID = 'v1';

/**
 * Encrypts a JSON object using the CURRENT active key.
 * @param {object} payload - The object to encrypt
 * @returns {object} { encryptedData, iv, authTag, key_id }
 */
const encryptPayload = (payload) => {
    if (!payload) return null;
    
    // Schema enforcement is handled by the controller
    const text = JSON.stringify(payload);
    
    const key = KEY_REGISTRY[CURRENT_ACTIVE_KEY_ID];
    if (!key || key.length !== 32) {
        throw new Error(`CRITICAL: Encryption key registry fault for ID: ${CURRENT_ACTIVE_KEY_ID}`);
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const authTag = cipher.getAuthTag().toString('hex');

    return {
        encryptedData: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag,
        key_id: CURRENT_ACTIVE_KEY_ID
    };
};

/**
 * Decrypts a JSON object by automatically resolving the correct key_id.
 * @param {string} encryptedData - Hex encoded payload
 * @param {string} iv - Hex encoded IV
 * @param {string} authTag - Hex encoded Auth Tag
 * @param {string} key_id - The version ID of the key used (from DB)
 * @returns {object} Decrypted and parsed JSON payload
 * @throws {Error} If key is missing or integrity verification fails
 */
const decryptPayload = (encryptedData, iv, authTag, key_id) => {
    if (!encryptedData || !iv || !authTag || !key_id) {
        throw new Error('SECURITY_CRITICAL: Missing decryption metadata.');
    }

    // Dynamic key resolution from registry
    const key = KEY_REGISTRY[key_id];
    if (!key || key.length !== 32) {
        throw new Error(`SECURITY_CRITICAL: Historical key rotation fault. ID ${key_id} is missing from registry.`);
    }

    try {
        const decipher = crypto.createDecipheriv(
            ALGORITHM, 
            key, 
            Buffer.from(iv, 'hex')
        );
        
        decipher.setAuthTag(Buffer.from(authTag, 'hex'));
        
        let decryptedText = decipher.update(encryptedData, 'hex', 'utf8');
        decryptedText += decipher.final('utf8');

        const decrypted = JSON.parse(decryptedText);
        
        // Clean up text representation immediately (Memory Volatility Management)
        decryptedText = null; 

        return decrypted;
    } catch (err) {
        // HARD FAIL: Immediately reject request if tampered
        throw new Error(`SECURITY_CRITICAL: Decryption failed (Integrity violation). Data may be tampered.`);
    }
};

const getActiveKeyId = () => CURRENT_ACTIVE_KEY_ID;

module.exports = {
    encryptPayload,
    decryptPayload,
    getActiveKeyId
};
