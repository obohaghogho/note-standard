const express = require("express");
const router = express.Router();
const connectorController = require("../controllers/connectorController");
const { requireAuth } = require("../middleware/authMiddleware");
const { requireAdmin } = require("../middleware/securityMiddleware");

router.use(requireAuth);
router.use(requireAdmin);

router.get("/list", connectorController.listConnectors);
router.get("/:name/health", connectorController.getConnectorHealth);
router.get("/:name/balance", connectorController.queryProviderBalance);
router.post("/:name/reconcile", connectorController.reconcileProvider);

module.exports = router;
