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
router.post("/address", walletController.getAddress); // Reusing getAddress for now, can be extended for rotation
router.get("/ledger", walletController.getLedger);
router.get("/commissions", walletController.getCommissions);
router.post("/create", transactionLimiter, walletController.createWallet);
router.post(
  "/deposit/card",
  transactionLimiter,
  walletController.depositCard,
);
router.post(
  "/deposit/transfer",
  transactionLimiter,
  walletController.depositTransfer,
);
router.post("/deposit", transactionLimiter, walletController.deposit);
router.get("/deposit/status", walletController.getDepositStatus);
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
