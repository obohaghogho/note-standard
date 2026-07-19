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
  previewLimiter,
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
router.post("/limit-request", walletController.createLimitRequest);
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
router.post(
  "/deposit/submit-proof",
  transactionLimiter,
  walletController.submitDepositProof,
);
router.post("/deposit", transactionLimiter, walletController.deposit);
router.get("/deposit/status", walletController.getDepositStatus);
router.get("/transactions", transactionController.getHistory);
router.get("/transactions/:id/receipt", transactionController.downloadReceipt);
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
router.post("/swap/preview", previewLimiter, swapController.preview);
router.post(
  "/swap",
  transactionLimiter,
  requireRecaptcha,
  swapController.execute,
);

// Affiliate Endpoints
router.get("/affiliates/my-stats", walletController.getMyAffiliateStats);

// ── Wallet Hub Endpoints ─────────────────────────────────────────────────────
// These aggregate and enrich existing data for the multi-currency Wallet Hub UI.
router.get("/hub",               walletController.getHubView);
router.get("/portfolio",         walletController.getPortfolioSummary);
router.get("/currencies",        walletController.getCurrencyCatalog);
router.post(
  "/internal-transfer",
  transactionLimiter,
  walletController.internalTransfer,
);

module.exports = router;

