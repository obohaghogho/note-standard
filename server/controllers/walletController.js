const walletService = require("../services/walletService");

/**
 * Wallet Controller
 * Handles user wallet operations.
 */
exports.getBalances = async (req, res) => {
  try {
    const wallets = await walletService.getWallets(req.user.id);
    res.json(wallets);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.deposit = async (req, res) => {
  try {
    const result = await walletService.deposit(req.user.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.withdraw = async (req, res) => {
  try {
    const result = await walletService.withdraw(req.user.id, req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.transfer = async (req, res) => {
  try {
    const result = await walletService.transferInternal(
      req.user.id,
      req.userProfile?.plan,
      req.body,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.createWallet = async (req, res) => {
  try {
    const { currency, network } = req.body;
    const wallet = await walletService.createWallet(
      req.user.id,
      currency,
      network,
    );
    res.json(wallet);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
