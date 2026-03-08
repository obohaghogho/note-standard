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

exports.depositCard = async (req, res) => {
  try {
    let { amount, currency } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({
        error: "Amount and currency are required",
      });
    }

    currency = String(currency).replace(/"/g, "");

    const result = await require("../services/depositService")
      .createCardDeposit(
        req.user.id,
        currency,
        parseFloat(amount),
        req.userProfile?.plan || "FREE",
      );

    res.json(result);
  } catch (error) {
    console.error(error);
    const isValidationError = error.message.includes("limit") ||
      error.message.includes("Maximum") ||
      error.message.includes("must not exceed");

    res.status(isValidationError ? 400 : 500).json({
      error: error.message || "Server error",
    });
  }
};

exports.depositTransfer = async (req, res) => {
  try {
    let { amount, currency } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({
        error: "Amount and currency are required",
      });
    }

    currency = String(currency).replace(/"/g, "");

    const result = await require("../services/depositService")
      .createBankDeposit(
        req.user.id,
        currency,
        parseFloat(amount),
        req.userProfile?.plan || "FREE",
      );

    res.json(result);
  } catch (error) {
    console.error(error);
    const isValidationError = error.message.includes("limit") ||
      error.message.includes("Maximum") ||
      error.message.includes("must not exceed");

    res.status(isValidationError ? 400 : 500).json({
      error: error.message || "Server error",
    });
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

exports.getAddress = async (req, res) => {
  try {
    const { currency, network } = req.query;
    if (!currency) throw new Error("Currency is required");
    const result = await walletService.getAddress(
      req.user.id,
      currency,
      network || "native",
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getLedger = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const { data, error } = await require("../config/database")
      .from("ledger_entries")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ entries: data || [] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.getDepositStatus = async (req, res) => {
  try {
    const { reference } = req.query;
    if (!reference) throw new Error("Reference is required");
    const status = await require("../services/depositService").getDepositStatus(
      reference,
    );
    if (!status) {
      return res.status(404).json({ error: "Transaction not found" });
    }
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
