const express = require("express");
const router = express.Router();
const paymentController = require("../controllers/payment/paymentController");
const { requireAuth } = require("../middleware/auth");
const { transactionLimiter } = require("../middleware/rateLimiter");

router.post(
  "/initialize",
  requireAuth,
  transactionLimiter,
  paymentController.initialize,
);
router.get("/status/:reference", requireAuth, paymentController.checkStatus);

module.exports = router;
