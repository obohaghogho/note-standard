const { body, validationResult } = require("express-validator");

const validateRegistration = [
  body("fullName")
    .trim()
    .notEmpty().withMessage("Full name is required")
    .isLength({ min: 2, max: 50 }).withMessage(
      "Full name must be between 2 and 50 characters",
    )
    .escape(),
  body("username")
    .trim()
    .notEmpty().withMessage("Username is required")
    .isAlphanumeric().withMessage("Username must be alphanumeric")
    .isLength({ min: 3, max: 20 }).withMessage(
      "Username must be between 3 and 20 characters",
    )
    .escape(),
  body("email")
    .trim()
    .isEmail().withMessage("Invalid email address")
    .normalizeEmail(),
  body("password")
    .isLength({ min: 8 }).withMessage(
      "Password must be at least 8 characters long",
    )
    .matches(/\d/).withMessage("Password must contain at least one number")
    .matches(/[A-Z]/).withMessage(
      "Password must contain at least one uppercase letter",
    ),
  (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: errors.array()[0].msg });
    }
    next();
  },
];

module.exports = {
  validateRegistration,
};
