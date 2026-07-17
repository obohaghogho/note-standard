const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/authMiddleware');
const adminController = require('../controllers/adminController');

// All operations routes require an admin role
router.use(requireAuth);
router.use(adminController.requireAdminRole(['super_admin', 'platform_admin', 'support_engineer']));

// GET /api/ops/health — Platform health dashboard
router.get('/health', adminController.getHealthDashboard);

// GET /api/ops/finops - Financial Operations Dashboard
router.get('/finops', adminController.getFinOpsDashboard);

// GET /api/ops/flags — List all feature flags
router.get('/flags', adminController.getFeatureFlags);

// PATCH /api/ops/flags/:flagKey — Toggle a feature flag
router.patch(
  '/flags/:flagKey',
  adminController.requireAdminRole(['super_admin', 'platform_admin']),
  adminController.updateFeatureFlag
);

module.exports = router;
