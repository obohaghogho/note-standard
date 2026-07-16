const express = require("express");
const router = express.Router();
const manualDepositController = require("../controllers/deposit/manualDepositController");
const { requireAuth, requireAdmin } = require("../middleware/auth");

/**
 * Manual Deposit Routes
 * /api/deposit
 */

// User routes
router.get("/initiate", requireAuth, (req, res) => manualDepositController.initiateDeposit(req, res));
router.post("/submit", requireAuth, (req, res) => manualDepositController.submitDeposit(req, res));
router.get("/user", requireAuth, (req, res) => manualDepositController.getUserDeposits(req, res));

// Admin routes
router.get("/admin/pending", requireAdmin, (req, res) => manualDepositController.getPendingDeposits(req, res));
router.patch("/:id/approve", requireAdmin, (req, res) => manualDepositController.approveDeposit(req, res));
router.patch("/:id/reject", requireAdmin, (req, res) => manualDepositController.rejectDeposit(req, res));

module.exports = router;
