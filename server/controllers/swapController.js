const swapService = require("../services/swapService");
const fxService = require("../services/fxService");

/**
 * Swap Controller
 * Handles currency exchange logic.
 */
exports.getRates = async (req, res) => {
  try {
    const rates = await fxService.getAllRates();
    res.json(rates);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.preview = async (req, res) => {
  try {
    const { from, to, amount, slippage } = req.body;
    const quote = await swapService.calculateSwap(
      req.user.id,
      from,
      to,
      amount,
      slippage,
    );
    res.json(quote);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.execute = async (req, res) => {
  try {
    const { lockId, idempotencyKey } = req.body;
    const result = await swapService.executeSwap(
      req.user.id,
      lockId,
      idempotencyKey,
    );
    res.json(result);
  } catch (err) {
    console.error(
      "[SwapController] Execute error:",
      err.message,
      err.details || err.hint || "",
    );
    res.status(500).json({ error: err.message });
  }
};
