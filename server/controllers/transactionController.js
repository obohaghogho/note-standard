const transactionService = require("../services/transactionService");

/**
 * Transaction Controller
 * Handles user transaction reporting.
 */
exports.getHistory = async (req, res) => {
  try {
    const { page, limit, type } = req.query;
    const history = await transactionService.getHistory(req.user.id, {
      page,
      limit,
      type,
    });
    res.json(history);
  } catch (err) {
    console.error("Wallet transactions route crash:", err);
    res.status(500).json({
      error: "Failed to fetch transactions",
      message: err.message,
    });
  }
};
