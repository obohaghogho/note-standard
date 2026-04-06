const path = require("path");

// ─── Environment Loading ──────────────────────────────────────
// dotenv does NOT overwrite existing values, so load order matters:
//   Development: .env.development first (priority) → .env (fallback)
//   Production:  .env only (Render sets NODE_ENV=production)
if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({
    path: path.join(__dirname, "..", ".env.development"),
  });
}
require("dotenv").config(); // .env as fallback (won't overwrite dev values)

/**
 * Validates that the given environment variables are present.
 * Throws an error if any are missing when in production.
 */
const validateEnv = (vars, isProduction) => {
  const missing = vars.filter((v) => !process.env[v]);
  if (missing.length > 0) {
    const errorMsg = `[Env] Critical environment variables missing: ${missing.join(", ")}`;
    if (isProduction) {
      throw new Error(errorMsg);
    } else {
      console.error(`\x1b[31m%s\x1b[0m`, `❌ CRITICAL ERROR: ${errorMsg}`);
      console.warn(`\x1b[33m%s\x1b[0m`, `⚠️  Server will start but features requiring these keys will fail.`);
    }
  }
};

const isProd = process.env.NODE_ENV === "production";

// ─── Critical Validation ──────────────────────────────────────
const criticalVars = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "JWT_SECRET",
  "PAYSTACK_SECRET_KEY",
  "FINCRA_SECRET_KEY"
];
validateEnv(criticalVars, isProd);

module.exports = {
  PORT: process.env.PORT || 5000,
  NODE_ENV: process.env.NODE_ENV || "development",
  
  // Supabase
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY,
  
  // Cache
  REDIS_URL: process.env.REDIS_URL || "",
  
  // Infrastructure
  CLOUDINARY_URL: process.env.CLOUDINARY_URL,
  CLIENT_URL: process.env.CLIENT_URL || (isProd ? "https://notestandard.com" : "http://localhost:3000"),
  SERVER_URL: process.env.SERVER_URL || process.env.BACKEND_URL || "http://localhost:5000",
  
  // Security
  JWT_SECRET: process.env.JWT_SECRET,
  RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY,
  
  // Wallet Fees
  FEES: {
    ADMIN_PERCENT: parseFloat(process.env.ADMIN_FEE_PERCENT || 4.5),
    PARTNER_PERCENT: parseFloat(process.env.PARTNER_FEE_PERCENT || 0.1),
    REFERRAL_PERCENT: parseFloat(process.env.REFERRAL_FEE_PERCENT || 0.1),
  },

  // Payment Providers
  PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY,
  FINCRA_SECRET_KEY: process.env.FINCRA_SECRET_KEY,
  FINCRA_PUBLIC_KEY: process.env.FINCRA_PUBLIC_KEY,
  NOWPAYMENTS_API_KEY: process.env.NOWPAYMENTS_API_KEY,
  COINGECKO_BASE_URL: process.env.COINGECKO_API || "https://api.coingecko.com/api/v3",
};

// Compute derived rates
module.exports.ADMIN_FEE_RATE = module.exports.FEES.ADMIN_PERCENT / 100;
module.exports.PARTNER_FEE_RATE = module.exports.FEES.PARTNER_PERCENT / 100;
module.exports.REFERRAL_FEE_RATE = module.exports.FEES.REFERRAL_PERCENT / 100;

console.log(
  `[Env] Configuration Loaded - Environment: ${module.exports.NODE_ENV}, Fees: ${module.exports.FEES.ADMIN_PERCENT}%`
);
