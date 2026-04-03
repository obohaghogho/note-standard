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

// Presence and legacy socket middleware removed in favor of 
// centralized gateway handling.

// Background job for real-time Trends
const analyticsService = require("./services/analyticsService");
const paymentWorker = require("./workers/paymentWorker");
const paymentService = require("./services/payment/paymentService");

// 1. Immediate aggregation on startup
(async () => {
  try {
    console.log("[Trends] Running initial aggregation...");
    await analyticsService.aggregateDailyStats();
    console.log("[Trends] Initial aggregation complete.");
  } catch (err) {
    console.error("[Trends] Initial aggregation failed:", err.message);
  }
})();

// 2. Real-time broadcast (Every 60s) via Gateway
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

// 3. Periodic persistence (Every 6 hours)
setInterval(async () => {
  try {
    console.log("[Trends] Running scheduled persistence...");
    await analyticsService.aggregateDailyStats();
  } catch (err) {
    console.error("[Trends] Scheduled persistence failed:", err.message);
  }
}, 6 * 60 * 60 * 1000);

// All frontend-facing socket connections are now handled by the gateway.

// ─── Real-time Exchange Rate Broadcasting ───────────────────
/**
 * Active broadcasting ensures the UI is always in sync with backend pricing, 
 * especially critical for swaps and balance displays.
 */
setInterval(async () => {
  try {
    const rates = await fxService.getAllRates();
    await realtime.broadcast("rates_updated", rates);
  } catch (err) {
    logger.error(`[Rates Broadcast] Error: ${err.message}`);
  }
}, 30000); 
// ──────────────────────────────────────────────────────────────

// ─── Payment Expiry Worker ───────────────────────────────────
// Automatically expires pending Grey payments after their window closes
// and sends notification emails to affected users.
const paymentExpiry = require("./workers/paymentExpiry");
// ──────────────────────────────────────────────────────────────
// ─── Startup Logging ──────────────────────────────────────────
// Log public IP for troubleshooting and NOWPayments whitelisting
https.get("https://api.ipify.org", (res) => {
  res.on("data", (ip) => {
    console.log("SERVER PUBLIC IP:", ip.toString());
  });
});
// ──────────────────────────────────────────────────────────────

server.listen(PORT, "0.0.0.0", () => {
  logger.info(`Server running on port ${PORT}`);

  // Start the payment expiry worker after server is listening
  paymentExpiry.start();
});
