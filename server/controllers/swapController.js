const swapService = require("../services/swapService");
const fxService = require("../services/fxService");

/**
 * Swap Controller
 * Handles currency exchange logic.
 */
exports.getRates = async (req, res) => {
  try {
    const data = await fxService.getAllRates("USD", req.user?.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * Perform Currency Swap (v6.0 Scoped Freeze Aware)
 */
exports.executeSwap = async (req, res, next) => {
  try {
    const { from, to, amount } = req.body;
    
    // 1. Refetch authoritative state for execution
    const data = await fxService.getAllRates("USD", req.user.id);
    const frozenAssets = data.frozenAssets || [];

    // 2. Domain-Level Freeze Enforcer (Scoped)
    if (frozenAssets.includes(from) || frozenAssets.includes(to) || frozenAssets.includes("*")) {
      return res.status(403).json({ 
        error: "DOMAIN_FREEZE_ACTIVE", 
        message: `Execution for ${from}/${to} is temporarily suspended due to volatility.`,
        evaluationId: data.evaluationId
      });
    }

    const result = await swapService.executeSwap(req.user.id, from, to, amount);
    res.json(result);
  } catch (err) {
    next(err);
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
