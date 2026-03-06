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
    res.status(500).json({ error: err.message });
  }
};
