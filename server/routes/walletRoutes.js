const express = require("express");
const router = express.Router();
const walletController = require("../controllers/walletController");
const transactionController = require("../controllers/transactionController");
const swapController = require("../controllers/swapController");
const { requireAuth } = require("../middleware/authMiddleware");
const {
  transactionLimiter,
  withdrawalLimiter,
  apiLimiter,
} = require("../middleware/rateLimiter");
const { requireRecaptcha } = require("../middleware/securityMiddleware");

// All wallet routes require authentication and general API limiting
router.use(requireAuth);
router.use(apiLimiter);

// Wallet Endpoints
router.get("/", walletController.getBalances);
router.get("/address", walletController.getAddress);
router.post("/create", transactionLimiter, walletController.createWallet);
router.get("/transactions", transactionController.getHistory);
router.post(
  "/transfer",
  transactionLimiter,
  requireRecaptcha,
  walletController.transfer,
);
router.post(
  "/withdraw",
  withdrawalLimiter,
  requireRecaptcha,
  walletController.withdraw,
);

// Swap Endpoints (Consolidated)
router.get("/exchange-rates", swapController.getRates);
router.post("/swap/preview", transactionLimiter, swapController.preview);
router.post(
  "/swap",
  transactionLimiter,
  requireRecaptcha,
  swapController.execute,
);

module.exports = router;
