const express = require("express");
const logger = require("./utils/logger");
const path = require("path");
const cors = require("cors");
const { corsOptions } = require("./utils/cors");
const helmet = require("helmet");
const morgan = require("morgan");
const env = require("./config/env");
const cloudinary = require("./config/cloudinary");

const app = express();

// Configure CORS (Strict)
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// Trust proxy
app.set("trust proxy", 1);

// Security headers
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  contentSecurityPolicy: false,
}));

// Body parsers
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));
app.use(morgan("dev"));

// ─── Routes ──────────────────────────────────────────────────
// Health check (with Supabase ping)
app.get("/api/health", async (req, res) => {
  try {
    const { data, error } = await require("./config/database")
      .from("profiles")
      .select("id")
      .limit(1);
    
    if (error) throw error;
    
    res.json({ 
      status: "ok", 
      supabase: "connected",
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    logger.error("[Health] Supabase connection failed:", err.message);
    res.status(503).json({ 
      status: "error", 
      supabase: "disconnected",
      details: err.message
    });
  }
});

app.get("/", (req, res) => {
  res.json({ message: "Note Standard API is running 🚀" });
});

// Load Routes
const authRoutes = require("./routes/authRoutes");
const walletRoutes = require("./routes/walletRoutes");
const notesRoutes = require("./routes/notes");
const chatRoutes = require("./routes/chat");
const uploadRoutes = require("./routes/upload");
const subscriptionRoutes = require("./routes/subscription");
const adminRoutes = require("./routes/admin");
const notificationRoutes = require("./routes/notifications");
const communityRoutes = require("./routes/community");
const adsRoutes = require("./routes/ads");
const broadcastsRoutes = require("./routes/broadcasts");
const analyticsRoutes = require("./routes/analytics");

// API Mounts
app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
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

// Legacy/Provider Specific Routes
app.use("/api/paystack", require("./routes/paystackRoutes"));
app.use("/api/webhooks", require("./routes/webhooks"));
app.use("/webhook", require("./routes/webhooks"));
app.use("/api/payment", require("./routes/payment"));

// Dedicated Webhook Handlers
app.use("/api/nowpayments/webhook", (req, res, next) => {
  req.url = "/nowpayments";
  next();
}, require("./routes/webhooks"));

app.use("/api/flutterwave/webhook", (req, res, next) => {
  req.url = "/flutterwave";
  next();
}, require("./routes/webhooks"));

// Middleware
const { requireAuth } = require("./middleware/authMiddleware");
const paymentController = require("./controllers/payment/paymentController");

app.post("/api/verify-payment", requireAuth, paymentController.verifyPayment);

// Direct Flutterwave Webhook Route
app.post("/api/flutterwave-webhook", async (req, res) => {
  try {
    console.log("Webhook received:", JSON.stringify(req.body, null, 2));
    return res.status(200).send("Webhook received");
  } catch (error) {
    console.error("Webhook Error:", error);
    return res.status(500).send("Error");
  }
});

app.use("/api/media", require("./routes/media"));
// PeerJS signaling is mounted directly on the HTTP server in index.js

// ─── Serve Frontend (Production) ──────────────────────────────
// Serve static files from the React app
app.use(express.static(path.join(__dirname, "../client/dist")));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get(/.*/, (req, res, next) => {
  // Pass API requests through to the error handler so they return JSON 404 instead of HTML
  if (req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

app.use((err, req, res, next) => {
  // CORS rejection
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS policy: origin not allowed" });
  }

  // All other errors
  logger.error("Unhandled error:", { 
    message: err.message, 
    stack: err.stack,
    path: req.path,
    method: req.method 
  });
  
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === "production"
      ? "Internal server error"
      : err.message,
    details: process.env.NODE_ENV !== "production" ? err.stack : undefined
  });
});

module.exports = app;
