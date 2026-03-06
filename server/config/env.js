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
  CLOUDINARY_URL: process.env.CLOUDINARY_URL,
  CLIENT_URL: process.env.CLIENT_URL || "http://localhost:3000",
  CG_API_KEY: process.env.CG_API_KEY,
  EXCHANGE_RATE_API_KEY: process.env.EXCHANGE_RATE_API_KEY,
  FLUTTERWAVE_SECRET_KEY: process.env.FLUTTERWAVE_SECRET_KEY,
  RECAPTCHA_SECRET_KEY: process.env.RECAPTCHA_SECRET_KEY,
};
