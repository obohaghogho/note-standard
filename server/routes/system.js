const express = require('express');
const router = express.Router();
const features = require('../config/features');
const { requireAdmin } = require('../middleware/authMiddleware');

/**
 * System Build Info Endpoint
 * Used for deployment verification, reproducibility, and gating.
 */
router.get('/build-info', (req, res) => {
    res.json({
        git_commit: process.env.VERCEL_GIT_COMMIT_SHA || process.env.EAS_BUILD_GIT_COMMIT_HASH || process.env.RENDER_GIT_COMMIT || 'unknown',
        schema_version: '189',
        feature_flags: features,
        build_timestamp: process.env.BUILD_TIMESTAMP || new Date().toISOString(),
        app_version: process.env.npm_package_version || '1.6.0',
        platform: 'server'
    });
});

const systemStatusCtrl = require('../controllers/systemStatusController');

// GET /api/system/status     Lightweight public status endpoint for web & mobile app status badges
// GET /api/system/trace/:id  End-to-end correlation trace linking customer, ledger, provider tx, webhooks, settlement & audit log
router.get('/status',    systemStatusCtrl.getPublicSystemStatus);
router.get('/trace/:id', systemStatusCtrl.getTransactionTrace);

module.exports = router;
