const express = require("express");
const router = express.Router();
const financialController = require("../controllers/financialController");
const { requireAuth } = require("../middleware/authMiddleware");
const { apiLimiter } = require("../middleware/rateLimiter");

router.use(requireAuth);
router.use(apiLimiter);

router.get("/analytics", financialController.getFinancialAnalytics);
router.get("/ai-insights", financialController.getAiInsights);

module.exports = router;
