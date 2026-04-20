const express = require('express');
const router = express.Router();
const bankAccountController = require('../controllers/bankAccountController');
const { requireAuth } = require('../middleware/authMiddleware');
const bankSecurityLimiter = require('../middleware/bankRateLimiter');
const timingShield = require('../middleware/timingShield');
const responseGuard = require('../middleware/responseGuard');
const securityMonitor = require('../services/securityMonitor');

/**
 * LOCKOUT ENFORCEMENT MIDDLEWARE (Request-Phase)
 * Checks Redis for pre-existing lockouts BEFORE entering any route logic.
 * Reject-first approach — no computation wasted on locked entities.
 */
const enforceLockout = async (req, res, next) => {
    try {
        const locked = await securityMonitor.isLockedOut(req.user?.id, req.ip);
        if (locked) {
            return res.status(403).json({
                success: false,
                error: 'Security lockout active. Contact support.',
                code: 'SECURITY_LOCKOUT'
            });
        }
        next();
    } catch (err) {
        // Fail-closed: lockout check failure → deny access
        return res.status(500).json({ success: false, error: 'Security subsystem fault.', code: 'SECURITY_SUBSYSTEM_ERROR' });
    }
};

// ─── GLOBAL ROUTE GUARDS (Order matters — security chain) ────
router.use(requireAuth);         // 1. Authentication gate
router.use(enforceLockout);      // 2. Pre-existing lockout check (fail-closed)
router.use(timingShield());      // 3. Timing normalization (must wrap all paths)
router.use(bankSecurityLimiter); // 4. Multi-dimensional rate limiting

/**
 * POST /api/bank-account — Save or update bank account
 * Allowlist: only serialized fields permitted through
 */
router.post('/',
    responseGuard('POST /api/bank-account'),
    bankAccountController.saveBankAccount
);

/**
 * GET /api/bank-account — Retrieve masked account (currency-scoped)
 * Anti-aggregation: currency query param is mandatory
 */
router.get('/',
    responseGuard('GET /api/bank-account'),
    bankAccountController.getBankAccount
);

/**
 * GET /api/bank-account/admin/:userId — Admin masked read
 * Must use same serializer — admin NEVER sees raw data
 */
router.get('/admin/:userId',
    responseGuard('GET /api/bank-account'),
    bankAccountController.adminGetBankAccount
);

module.exports = router;
