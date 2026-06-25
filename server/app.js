const express = require("express");
global.__BOOT_READY__ = false;
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
  crossOriginResourcePolicy: false,
  contentSecurityPolicy: process.env.NODE_ENV === "production" ? {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://www.google.com/recaptcha/", "https://www.gstatic.com/recaptcha/"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      imgSrc: ["'self'", "data:", "blob:", "https://*.supabase.co", "https://res.cloudinary.com", "https://api.dicebear.com"],
      connectSrc: ["'self'", "https://*.supabase.co", "wss://*.supabase.co", "https://realtime-gateway-gsb5.onrender.com", "wss://realtime-gateway-gsb5.onrender.com", "https://api.fincra.com", "https://api.paystack.co", "https://api.nowpayments.io", "https://*.agora.io", "wss://*.agora.io", "https://*.sd-rtn.com", "wss://*.sd-rtn.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'", "blob:", "https://res.cloudinary.com", "https://*.supabase.co"],
      frameSrc: ["'self'", "https://www.google.com/recaptcha/", "https://checkout.paystack.com", "https://checkout.fincra.com"],
    }
  } : false,
  crossOriginEmbedderPolicy: false,
}));

// Additional CORS/CORB Fix: Force headers for local dev
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const isLocal = origin && (
    origin.includes('localhost') || 
    origin.includes('127.0.0.1') || 
    origin.includes('[::1]') ||
    origin.includes('::1')
  );

  if (isLocal) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
    // Force allow sniffing for local dev to prevent CORB on JSON/Source maps
    res.removeHeader('X-Content-Type-Options');
  }
  next();
});

const correlationId = require("./middleware/correlationId");
app.use(correlationId);

// ─── Webhook Pre-Parser Interceptor ──────────────────────────
app.use((req, res, next) => {
  if (req.originalUrl && req.originalUrl.includes('webhook')) {
    logger.info("[Webhook Raw Connection Received]", {
      path: req.originalUrl,
      method: req.method,
      contentLength: req.headers['content-length'],
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress
    });
  }
  next();
});

// Body parsers
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  },
}));

if (process.env.NODE_ENV === "production") {
  app.use(morgan("combined"));
} else {
  app.use(morgan("dev"));
}

// ─── Middleware ──────────────────────────────────────────────
const { requireAuth, requireAdmin } = require("./middleware/authMiddleware");
const ApiError = require("./utils/apiError");
const paymentController = require("./controllers/payment/paymentController");


// ─── Deterministic Boot Architecture Gate ──────────────────
// SINGLE admission authority for ALL HTTP traffic.
// The BootManager must mark every service ready before any request passes.
const bootGate = require('./middleware/bootGate');
app.use(bootGate);

// Boot Status Endpoint (public, always available)
app.get("/api/boot/status", (req, res) => {
  res.json(global.BOOT_STATE || { phase: "STARTING", ready: false });
});

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

// TEST 1 & 2: Gateway Reachability Diagnostics
app.get("/api/diagnose-gateway", async (req, res) => {
  const gatewayUrl = process.env.REALTIME_GATEWAY_URL;
  const result = {
    env_REALTIME_GATEWAY_URL: gatewayUrl,
    is_undefined: gatewayUrl === undefined,
    is_localhost: gatewayUrl ? gatewayUrl.includes('localhost') : false,
    ping_status: null,
    ping_body: null,
    ping_time_ms: null,
    ping_error: null
  };

  if (!gatewayUrl) {
    return res.json(result);
  }

  const start = Date.now();
  try {
    const fetch = require('node-fetch');
    // Fetch from gateway's public health endpoint or just the root
    const pingRes = await fetch(`${gatewayUrl}/health`, { timeout: 10000 });
    result.ping_time_ms = Date.now() - start;
    result.ping_status = pingRes.status;
    result.ping_body = await pingRes.text();
  } catch (err) {
    result.ping_time_ms = Date.now() - start;
    result.ping_error = {
      message: err.message,
      code: err.code,
      stack: err.stack
    };
  }

  res.json(result);
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
const manualDepositRoutes = require("./routes/manualDepositRoutes");
const bankAccountRoutes = require("./routes/bankAccountRoutes");
const teamRoutes = require("./routes/teamRoutes");
const sessionRoutes = require("./routes/session");
const agoraRoutes = require("./routes/agora");

// API Mounts
app.use("/api/auth", authRoutes);
app.use("/api/wallet", walletRoutes);
app.use("/api/deposit", manualDepositRoutes);
app.use("/api/notes", notesRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/users", require("./routes/usersRoutes"));
app.use("/api/upload", uploadRoutes);
app.use("/api/media", require("./routes/media"));
app.use("/api/version", require("./routes/version"));
app.use("/api/subscription", subscriptionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/ads", adsRoutes);
app.use("/api/broadcasts", broadcastsRoutes);
app.use("/api/analytics", analyticsRoutes);
app.use("/api/bank-account", bankAccountRoutes);
app.use("/api/limit-requests", requireAuth, require("./routes/limitRequests"));
app.use("/api/webrtc", require("./routes/webrtc"));
app.use("/api/teams", teamRoutes);
app.use("/api/agora", requireAuth, agoraRoutes);
app.use("/api/system", require("./routes/system"));
app.use("/api/session", sessionRoutes);

// Phase 6.2: Replay Debugger
const replayRoutes = require("./tools/replayDebugger/replayRoutes");
app.use(replayRoutes);

// Phase 6.2 Step 3: Chaos Simulator
const { runChaosScenario } = require("./tools/chaosSimulator/index.js");
app.post("/api/debug/chaos/run", async (req, res) => {
  const { conversation_id, level } = req.body;
  const result = await runChaosScenario({
    conversationId: conversation_id,
    level: level || 1
  });
  res.json(result);
});

// Phase 8.3: Replay Certification Layer
const certificateRoutes = require("./tools/replayCertification/certificateAPI");
app.use(certificateRoutes);

// ─── Payment, Transaction & Webhook Routes ────────────────────
// CRITICAL: These MUST be mounted BEFORE the SystemState mutation block.
// Payment initialization, verification, and webhook ingestion must always
// be reachable — they are never subject to the global SAFE MODE gate.
app.use("/api/payment", require("./routes/payment"));
app.use("/api/transactions", require("./routes/transactionRoutes"));

// Webhook Routes (ALL providers)
// Paystack, Grey, Fincra, NowPayments, Flutterwave all route through here.
app.use("/api/webhooks", require("./routes/webhooks"));

// Alias: /api/nowpayments/webhook → /api/webhooks/nowpayments
app.use("/api/nowpayments/webhook", (req, res, next) => {
  req.url = "/nowpayments";
  next();
}, require("./routes/webhooks"));

// Alias: /api/flutterwave/webhook → /api/webhooks/flutterwave
app.use("/api/flutterwave/webhook", (req, res, next) => {
  req.url = "/flutterwave";
  next();
}, require("./routes/webhooks"));

const SystemState = require('./config/SystemState');

// ─── System Operational Governance Middleware ─────────────────────
// 1. System Status Endpoint (Admin Only)
app.get('/api/system-status', requireAdmin, (req, res) => {
    res.json(SystemState.getStatusData());
});

// 2. Global Mutation Block (Tiered Safe Mode)
// NOTE: Payment/transaction/webhook routes above are intentionally excluded.
// This block only gates remaining mutation endpoints (swap, withdraw, etc.)
app.use((req, res, next) => {
    // We allow Auth and pure GETs even in SAFE MODE
    if (req.originalUrl.startsWith('/api/auth')) return next();
    if (req.method === 'GET') return next();
    if (req.originalUrl.includes('/webhook')) return next();

    // Any remaining mutation (swap, wallet ops) is blocked
    if (SystemState.isSafe()) {
      return res.status(503).json({
        code: "SYSTEM_SAFE_MODE",
        message: "Transactions are temporarily paused while we verify system integrity. Your funds remain secure."
      });
    }

    next();
});


app.post("/api/verify-payment", requireAuth, paymentController.verifyPayment);

// ─── Flutterwave (Legacy → Fincra) ───────────────────────────
// DEPRECATED: Standard Flutterwave logic is now routed through the Fincra engine 
// or the unified webhook router. Direct Flutterwave endpoints are being retired.

// ─── Dynamic App Downloads ───────────────────────────────────
const downloadService = require("./services/DownloadService");

app.get("/api/app/latest-apk", (req, res) => {
  const apk = downloadService.getLatestAPK();
  if (!apk) {
    return res.status(404).json({ error: "APK file not found" });
  }
  
  res.setHeader('Content-Type', 'application/vnd.android.package-archive');
  res.setHeader('Content-Disposition', `attachment; filename="${apk.filename}"`);
  res.sendFile(apk.path);
});

// ─── Serve Frontend (Production) ──────────────────────────────
app.use((req, res, next) => {
  if (req.path.endsWith('.apk')) {
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(req.path)}"`);
  } else if (req.path.endsWith('.ipa')) {
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${path.basename(req.path)}"`);
  }
  next();
});

app.use(express.static(path.join(__dirname, "../client/dist")));

// Temporary IP detection (Admin Only)
app.get("/api/server-ip", requireAdmin, async (req, res) => {
  const https = require("https");
  https.get("https://api.ipify.org", (resp) => {
    let data = "";
    resp.on("data", chunk => data += chunk);
    resp.on("end", () => res.send({ ip: data }));
  }).on("error", (err) => {
    res.status(500).json({ error: "Error fetching IP", details: err.message });
  });
});

app.get(/.*/, (req, res, next) => {
  if (req.path.startsWith("/api")) {
    return next();
  }
  res.sendFile(path.join(__dirname, "../client/dist/index.html"));
});

// ─── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  // CORS rejection
  if (err.message === "Not allowed by CORS") {
    return res.status(403).json({ error: "CORS policy: origin not allowed" });
  }

  // Use ApiError or default to 500
  const statusCode = err.statusCode || (err.status ? parseInt(err.status) : 500);
  const message = err.message || "Internal server error";
  const errorCode = err.errorCode || "INTERNAL_ERROR";

  // All other errors
  logger.error(`${req.method} ${req.path} - ${message}`, { 
    stack: env.NODE_ENV !== "production" ? err.stack : undefined,
    details: err.details
  });
  
  res.status(statusCode).json({
    success: false,
    error: message,
    code: errorCode,
    path: req.path,
    timestamp: new Date().toISOString()
  });
});

module.exports = app;
