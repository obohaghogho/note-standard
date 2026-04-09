const path = require("path");
const logger = require("./utils/logger");
const env = require("./config/env");

const app = require("./app");
const http = require("http");
const https = require("https");
const supabase = require("./config/database");
const fxService = require("./services/fxService");
const realtime = require("./services/realtimeService");

const server = http.createServer(app);

// ─── Realtime Gateway Transition ──────────────────────────────
// This service now delegates all socket handling to the 
// realtime-gateway service. Communication happens via Redis.
// ──────────────────────────────────────────────────────────────

// Global Error Handlers for Process Stability
process.on("uncaughtException", (err) => {
  logger.error("[Process] Uncaught Exception:", err);
  // Give logger time to write before potentially failing
  setTimeout(() => process.exit(1), 1000);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("[Process] Unhandled Rejection at:", promise, "reason:", reason);
});

const PORT = env.PORT;

// Required Services & Workers
const analyticsService = require("./services/analyticsService");
const paymentWorker = require("./workers/paymentWorker");
const paymentService = require("./services/payment/paymentService");
const paymentExpiry = require("./workers/paymentExpiry");

/**
 * 🚀 START SERVER IMMEDIATELY
 * We bind to the port as early as possible to satisfy Render's port detection.
 * All heavy initialization and background workers start AFTER the server is live.
 */
server.listen(PORT, "0.0.0.0", async () => {
  logger.info(`Server running on port ${PORT}`);

  // 1. Log Public IP (Async, non-blocking)
  https.get("https://api.ipify.org", (res) => {
    res.on("data", (ip) => {
      console.log("SERVER PUBLIC IP:", ip.toString());
    });
  }).on('error', (e) => logger.warn(`[IPify] Failed to fetch public IP: ${e.message}`));

  // 2. Start Background Workers
  paymentExpiry.start();
  // paymentWorker is usually managed separately but included here if needed
  
  // 3. Initial Market Data & Trends Aggregation
  try {
    console.log("[Trends] Running initial aggregation...");
    await analyticsService.aggregateDailyStats();
    console.log("[Trends] Initial aggregation complete.");
    
    const rates = await fxService.getAllRates();
    await realtime.broadcast("rates_updated", rates);
    
    const stats = await analyticsService.getRealtimeStats();
    if (stats) {
      await realtime.broadcast("stats_updated", stats);
    }
  } catch (err) {
    logger.error(`[Startup] Background initialization failed: ${err.message}`);
  }

  // 4. Register Recurring Jobs
  
  // Real-time Trends Broadcast (Every 60s)
  setInterval(async () => {
    try {
      const stats = await analyticsService.getRealtimeStats();
      if (stats) {
        await realtime.broadcast("stats_updated", stats);
      }
    } catch (err) {
      console.error("[Trends] Interval broadcast failed:", err.message);
    }
  }, 60000);

  // Periodic Trends Persistence (Every 6 hours)
  setInterval(async () => {
    try {
      console.log("[Trends] Running scheduled persistence...");
      await analyticsService.aggregateDailyStats();
    } catch (err) {
      console.error("[Trends] Scheduled persistence failed:", err.message);
    }
  }, 6 * 1000 * 60 * 60);

  // Exchange Rate Broadcasting (Every 30s)
  setInterval(async () => {
    try {
      const rates = await fxService.getAllRates();
      await realtime.broadcast("rates_updated", rates);
    } catch (err) {
      logger.error(`[Rates Broadcast] Error: ${err.message}`);
    }
  }, 30000);
});
