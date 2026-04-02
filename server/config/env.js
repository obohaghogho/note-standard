const path = require("path");
require("dotenv").config();

// Load .env.development if not in production
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: path.join(__dirname, "..", ".env.development"),
  });
}

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  CLOUDINARY_URL: process.env.CLOUDINARY_URL,
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:3000",
  CG_API_KEY: process.env.CG_API_KEY,
  FLUTTERWAVE_SECRET_KEY: process.env.FLUTTERWAVE_SECRET_KEY,
  RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY,

  // Wallet Fees
  ADMIN_FEE_RATE: parseFloat(process.env.ADMIN_FEE_PERCENT || 4.5) / 100,
  PARTNER_FEE_RATE: parseFloat(process.env.PARTNER_FEE_PERCENT || 0.1) / 100,
  REFERRAL_FEE_RATE: parseFloat(process.env.REFERRAL_FEE_PERCENT || 0.1) / 100,

  // Provider Config
  COINGECKO_BASE_URL: process.env.COINGECKO_API ||
    "https://api.coingecko.com/api/v3",
  NOWPAYMENTS_API_KEY: process.env.NOWPAYMENTS_API_KEY,
  SERVER_URL: process.env.SERVER_URL || process.env.BACKEND_URL,
};

// Log loaded fee rates for verification
console.log(
  `[Env] Fees Loaded - Admin: ${
    module.exports.ADMIN_FEE_RATE * 100
  }%, Partner: ${module.exports.PARTNER_FEE_RATE * 100}%, Referrer: ${
    module.exports.REFERRAL_FEE_RATE * 100
  }%`,
);
