const BulkInternalPaymentService = require("../../services/BulkInternalPaymentService");

exports.createBatch = async (req, res) => {
  try {
    const result = await BulkInternalPaymentService.createBatch(req.user, req.body);
    return res.status(201).json(result);
  } catch (err) {
    const msg = err.message || "Failed to create payout batch";
    const isConflict = msg.includes("IDEMPOTENCY_KEY_PAYLOAD_MISMATCH") || msg.includes("DUPLICATE");
    const isBadRequest = msg.includes("INVALID_") || msg.includes("SOURCE_WALLET_") || msg.includes("RECIPIENT_") || msg.includes("CURRENCY_") || msg.includes("SELF_PAYMENT_");
    const statusCode = isConflict ? 409 : (isBadRequest ? 400 : 500);
    return res.status(statusCode).json({ error: msg });
  }
};

exports.getBatches = async (req, res) => {
  try {
    const result = await BulkInternalPaymentService.getBatches(req.query);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message || "Failed to list payout batches" });
  }
};

exports.getBatchDetail = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await BulkInternalPaymentService.getBatchDetail(id);
    return res.json(result);
  } catch (err) {
    const isNotFound = err.message?.includes("BATCH_NOT_FOUND");
    return res.status(isNotFound ? 404 : 500).json({ error: err.message || "Failed to fetch payout batch details" });
  }
};

exports.approveBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await BulkInternalPaymentService.approveBatch(req.user, id);
    return res.json(result);
  } catch (err) {
    const msg = err.message || "Failed to approve payout batch";
    const isForbidden = msg.includes("CREATOR_CANNOT_APPROVE");
    const isConflict = msg.includes("INVALID_STATUS_TRANSITION") || msg.includes("APPROVAL_FAILED");
    const isNotFound = msg.includes("BATCH_NOT_FOUND");
    const statusCode = isForbidden ? 403 : (isNotFound ? 404 : (isConflict ? 409 : 500));
    return res.status(statusCode).json({ error: msg });
  }
};

exports.executeBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await BulkInternalPaymentService.executeBatch(req.user, id);
    return res.json(result);
  } catch (err) {
    const msg = err.message || "Failed to execute payout batch";
    const isForbidden = msg.includes("APPROVAL_GATE_VIOLATION") || msg.includes("SAFE_MODE_BLOCK");
    const isNotFound = msg.includes("BATCH_NOT_FOUND");
    const isConflict = msg.includes("IDEMPOTENCY_BATCH_MISMATCH") || msg.includes("INSUFFICIENT_SOURCE_BALANCE") || msg.includes("EXECUTION_FAILURE");
    const statusCode = isForbidden ? 403 : (isNotFound ? 404 : (isConflict ? 409 : 500));
    return res.status(statusCode).json({ error: msg });
  }
};

exports.cancelBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await BulkInternalPaymentService.cancelBatch(req.user, id);
    return res.json(result);
  } catch (err) {
    const msg = err.message || "Failed to cancel payout batch";
    const isNotFound = msg.includes("BATCH_NOT_FOUND");
    const isConflict = msg.includes("INVALID_STATUS_TRANSITION") || msg.includes("CANCELLATION_FAILED");
    const statusCode = isNotFound ? 404 : (isConflict ? 409 : 500);
    return res.status(statusCode).json({ error: msg });
  }
};

exports.reconcileBatch = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await BulkInternalPaymentService.reconcileBatch(req.user, id);
    return res.json(result);
  } catch (err) {
    const msg = err.message || "Failed to reconcile payout batch";
    const isNotFound = msg.includes("BATCH_NOT_FOUND");
    const isFailed = msg.includes("RECONCILIATION_FAILED");
    const statusCode = isNotFound ? 404 : (isFailed ? 409 : 500);
    return res.status(statusCode).json({ error: msg });
  }
};
