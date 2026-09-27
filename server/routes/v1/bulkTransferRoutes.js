const express = require("express");
const router = express.Router();
const bulkTransferController = require("../../controllers/admin/bulkTransferController");
const { requireAuth, requireAdmin, requireFinancialAdmin } = require("../../middleware/authMiddleware");

// Read-only endpoints (accessible by admin and support roles)
router.get("/", requireAuth, requireAdmin, bulkTransferController.getBatches);
router.get("/:id", requireAuth, requireAdmin, bulkTransferController.getBatchDetail);

// Financial mutation endpoints (strictly restricted to full admin role, excluding support role)
router.post("/", requireAuth, requireFinancialAdmin, bulkTransferController.createBatch);
router.post("/:id/approve", requireAuth, requireFinancialAdmin, bulkTransferController.approveBatch);
router.post("/:id/execute", requireAuth, requireFinancialAdmin, bulkTransferController.executeBatch);
router.post("/:id/cancel", requireAuth, requireFinancialAdmin, bulkTransferController.cancelBatch);
router.post("/:id/reconcile", requireAuth, requireFinancialAdmin, bulkTransferController.reconcileBatch);

module.exports = router;
