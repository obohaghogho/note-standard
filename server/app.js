// ─── Express Application (serverless-compatible) ─────────────
// This file contains the Express app with all middleware, routes,
// and error handling. It does NOT call server.listen() or set up
// Socket.IO — those are in index.js for local development only.
//
// This module is imported by:
//   - index.js      → local dev (adds Socket.IO + listen)
//   - netlify/functions/api.js → serverless (wraps with serverless-http)

const express = require("express");
const logger = require("./utils/logger");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cloudinary = require("cloudinary").v2;
const Sentiment = require("sentiment");
const sentimentAnalyzer = new Sentiment();

if (process.env.NODE_ENV !== "production") {
  require("dotenv").config({ path: path.join(__dirname, ".env.development") });
}
require("dotenv").config(); // Load .env as fallback or for production

const supabase = require(path.join(__dirname, "config", "supabase"));

// Configure Cloudinary from CLOUDINARY_URL env variable
if (process.env.CLOUDINARY_URL) {
  cloudinary.config();
  logger.info("Cloudinary configured successfully");
}

const app = express();

// 1. Authoritative CORS - MUST run first to handle all requests/errors
const { whitelist, corsOptions } = require("./utils/cors");
app.use(cors(corsOptions));

// Trust proxy (works for both NGINX and Netlify CDN)
app.set("trust proxy", 1);

// 2. Security headers (after CORS to avoid conflicts)
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));

// 3. Body parsers
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(morgan("dev"));

// ─── Routes ──────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ message: "Note Standard API is running 🚀" });
});

const notesRoutes = require(path.join(__dirname, "routes", "notes"));
const authRoutes = require(path.join(__dirname, "routes", "auth"));
const chatRoutes = require(path.join(__dirname, "routes", "chat"));
const uploadRoutes = require(path.join(__dirname, "routes", "upload"));
const subscriptionRoutes = require(
  path.join(__dirname, "routes", "subscription"),
);
const adminRoutes = require(path.join(__dirname, "routes", "admin"));
const notificationRoutes = require(
  path.join(__dirname, "routes", "notifications"),
);
const communityRoutes = require(path.join(__dirname, "routes", "community"));
const adsRoutes = require(path.join(__dirname, "routes", "ads"));
const broadcastsRoutes = require(path.join(__dirname, "routes", "broadcasts"));
const analyticsRoutes = require(path.join(__dirname, "routes", "analytics"));

app.use("/api/auth", authRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/upload", uploadRoutes);
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/ads", adsRoutes);
app.use("/api/broadcasts", broadcastsRoutes);
app.use("/api/analytics", analyticsRoutes);

app.use("/api/wallet", require(path.join(__dirname, "routes", "wallet")));
app.use(
  "/api/paystack",
  require(path.join(__dirname, "routes", "paystackRoutes")),
);
app.use("/api/webhooks", require(path.join(__dirname, "routes", "webhooks")));
app.use("/webhook", require(path.join(__dirname, "routes", "webhooks"))); // Alias for payment providers
app.use("/api/payment", require(path.join(__dirname, "routes", "payment")));
app.use("/api/media", require(path.join(__dirname, "routes", "media")));

app.use((err, req, res, next) => {
  const origin = req.headers.origin;

  const isLocal = origin && (
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1") ||
    origin.includes("[::1]")
  );

  const isNoteStandard = origin &&
    (origin.endsWith(".notestandard.com") ||
      origin === "https://notestandard.com");

  if (origin && (isNoteStandard || isLocal)) {
    res.set({
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin",
    });
  }

  // CORS rejection
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS policy: origin not allowed" });
  }

  // All other errors
  logger.error("Unhandled error:", err.message);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
  });
});

module.exports = app;
