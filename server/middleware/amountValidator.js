const { body, validationResult } = require("express-validator");
const mathUtils = require("../utils/mathUtils");

/**
 * Standardize and secure numeric amount inputs
 * 1. Must be a valid positive number
 * 2. Must be > 0 and <= 1,000,000 (Sanity cap)
 * 3. Enforce maximum 8 decimal places to prevent floating-point underflow/exploit
 */
const validateAmount = [
  body("amount")
    .exists()
    .withMessage("Amount is required")
    .isFloat({ min: 0.00000001, max: 1000000 })
    .withMessage(
      "Amount must be greater than 0 and less than or equal to 1,000,000",
    )
    .custom((value, { req }) => {
      // Prevent scientific notation exploits (e.g., 1e-10)
      if (typeof value === "string" && value.toLowerCase().includes("e")) {
        throw new Error("Scientific notation is not allowed");
      }

      // Format down to 8 decimal places max natively
      const cleanValue = mathUtils.formatForCurrency(value, "BTC"); // BTC enforces 8 decimals
      const numValue = parseFloat(cleanValue);

      if (isNaN(numValue) || numValue <= 0) {
        throw new Error("Invalid amount");
      }

      // Mutate the request body so downstream uses the strictly formatted 8-decimal string
      req.body.amount = cleanValue;
      return true;
    }),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    next();
  },
];

module.exports = {
  validateAmount,
};
