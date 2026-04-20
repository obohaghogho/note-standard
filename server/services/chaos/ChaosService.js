const crypto = require('crypto');
const logger = require('../../utils/logger');
const env = require('../../config/env');

/**
 * ChaosService - The Destruction Gateway
 * Implements Time-Bound Signed Capability Tokens for Adversarial Fault Injection.
 */
class ChaosService {
    constructor() {
        this.enabled = process.env.ALLOW_FAULT_INJECTION === 'true';
        this.rootSecret = this.enabled ? crypto.randomBytes(32).toString('hex') : null;
        this.activeSessions = new Set();
        
        if (this.enabled) {
            logger.warn('[CHAOS_SERVICE] ADVERSARIAL FAULT INJECTION ENABLED. ROOT_SECRET GENERATED.');
        }
    }

    /**
     * Create an ephemeral chaos session
     * Returns a signed capability token valid for 5 minutes
     */
    createSession() {
        if (!this.enabled) throw new Error('CHAOS_DISABLED: Fault injection is not allowed in this environment.');

        const sessionId = crypto.randomUUID();
        const expiry = Date.now() + (5 * 60 * 1000); // 5 minute hard expiry
        
        const payload = JSON.stringify({ sessionId, expiry });
        const signature = crypto.createHmac('sha256', this.rootSecret)
                                .update(payload)
                                .digest('hex');
                                
        const token = Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
        
        this.activeSessions.add(sessionId);
        logger.info(`[CHAOS_SERVICE] New session created: ${sessionId}. Expires at: ${new Date(expiry).toISOString()}`);
        
        return token;
    }

    /**
     * Verify a capability token
     */
    verifyToken(token) {
        if (!this.enabled || !token) return false;

        try {
            const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
            const { payload, signature } = decoded;
            
            const expectedSignature = crypto.createHmac('sha256', this.rootSecret)
                                            .update(payload)
                                            .digest('hex');

            if (signature !== expectedSignature) {
                logger.error('[CHAOS_SERVICE] Token tampered with. Cryptographic rejection.');
                return false;
            }

            const data = JSON.parse(payload);
            
            if (Date.now() > data.expiry) {
                logger.warn(`[CHAOS_SERVICE] Token expired for session ${data.sessionId}`);
                this.activeSessions.delete(data.sessionId);
                return false;
            }

            return true;
        } catch (err) {
            logger.error('[CHAOS_SERVICE] Token verification failed', { error: err.message });
            return false;
        }
    }

    /**
     * Gate for fault injection calls
     */
    async executeFault(token, faultFn) {
        if (!this.verifyToken(token)) {
            throw new Error('CHAOS_UNAUTHORIZED: Valid, time-bound capability token required.');
        }

        logger.warn('[CHAOS_SERVICE] Executing adversarial fault injection...');
        return await faultFn();
    }
}

module.exports = new ChaosService();
