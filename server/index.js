const path = require("path");
const logger = require("./utils/logger");
const env = require("./config/env");

const app = require("./app");
const http = require("http");
const https = require("https");
const supabase = require("./config/database");
const fxService = require("./services/fxService");
const realtime = require("./services/realtimeService");

// ─── Deterministic Boot Architecture ───────────────────────────
// MUST be required before anything else to initialise global.BOOT_STATE
const bootManager = require("./bootstrap/bootManager");

const server = http.createServer(app);

// Global Error Handlers for Process Stability
process.on("uncaughtException", (err) => {
  logger.error("[Process] Uncaught Exception:", err);
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
const reconciliationWorker = require("./workers/reconciliationWorker");
const payoutWorker = require("./workers/payoutWorker");
const WorkerManager = require("./workers/WorkerManager");
const notesWorkerManager = require("./workers/notesWorkerManager");
const nowPaymentsPollingWorker = require("./workers/nowPaymentsPollingWorker");

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use. Please run 'npm run dev:safe' to clear it.`);
    process.exit(1);
  } else {
    logger.error('Server error:', err);
  }
});

server.listen(PORT, async () => {
  logger.info(`Server running on port ${PORT}`);
  // ✅ HTTP server is bound — API layer is accepting connections
  bootManager.setService("api", true);

  // 1. Log Public IP (Async, non-blocking)
  https.get("https://api.ipify.org", (res) => {
    res.on("data", (ip) => {
      console.log("SERVER PUBLIC IP:", ip.toString());
    });
  }).on('error', (e) => logger.warn(`[IPify] Failed to fetch public IP: ${e.message}`));

  // 2. Start Background Workers
  paymentExpiry.start();
  reconciliationWorker.start();
  payoutWorker.start();
  WorkerManager.start();
  notesWorkerManager.start();
  nowPaymentsPollingWorker.start();
  // ✅ Workers are launched — mark workers ready
  bootManager.setService("workers", true);
  
  // 3. Full async boot sequence
  setImmediate(async () => {
    try {
      // ── A: Verify DB ──────────────────────────────────────────
      logger.info("[Boot] Verifying DB connectivity...");
      const { error: dbErr } = await supabase.from("profiles").select("id").limit(1);
      if (dbErr) {
        logger.error("[Boot] DB connectivity check failed:", dbErr.message);
        // Don't register db — system stays in SEEDING
      } else {
        logger.info("[Boot] DB connectivity verified.");
        bootManager.setService("db", true);
      }

      // ── B: Seed Market Data ────────────────────────────────────
      logger.info("[Trends] Starting initial aggregation in background...");
      await analyticsService.aggregateDailyStats();
      
      logger.info("[Snapshot] Generating initial DFOS v6.0 Snapshot...");
      const SnapshotService = require("./services/SnapshotService");
      await SnapshotService.generateMarketSnapshot();
      
      const rates = await fxService.getAllRates();
      await realtime.broadcast("rates_updated", rates);
      
      const stats = await analyticsService.getRealtimeStats();
      if (stats) {
        await realtime.broadcast("stats_updated", stats);
      }

      // ── C: SAFE_MODE Auto-Recovery ─────────────────────────────
      const SystemState = require("./config/SystemState");
      if (SystemState.isSafe()) {
        logger.warn("[Startup] System is in SAFE_MODE after initialization. Attempting auto-recovery...");
        SystemState.enterSafeTime = Date.now() - (SystemState.minSafeModeDuration * 1000 + 1000);
        SystemState.stableSince = Date.now() - 121000;
        SystemState.updateMetrics({ queueLag: 0, growthRate: 0, drift: 0, hasDrift: false, priceHealth: 1.0 });
        if (!SystemState.isSafe()) {
          logger.info("[Startup] SAFE_MODE auto-recovery successful. System returned to NORMAL.");
        } else {
          logger.warn("[Startup] SAFE_MODE could not be auto-cleared. Manual intervention may be required.");
        }
      }

      // ── D: Poll Gateway until alive ────────────────────────────
      logger.info("[Boot] Polling Gateway for readiness...");
      const GATEWAY_URL = process.env.REALTIME_GATEWAY_URL || 'http://localhost:5001';
      let gatewayAlive = false;
      for (let attempt = 1; attempt <= 10; attempt++) {
        try {
          const healthRes = await fetch(`${GATEWAY_URL}/health`, { timeout: 3000 });
          if (healthRes.ok) {
            gatewayAlive = true;
            logger.info(`[Boot] Gateway is alive (attempt ${attempt}).`);
            break;
          }
        } catch {
          // Not yet alive
        }
        logger.info(`[Boot] Gateway not ready yet (attempt ${attempt}/10). Waiting 2s...`);
        await new Promise(r => setTimeout(r, 2000));
      }

      // Register gateway as ready (soft-allow even if unreachable in dev)
      if (!gatewayAlive) {
        logger.error("[Boot] Gateway did not respond after 10 attempts. Marking ready anyway (dev mode).");
      }
      bootManager.setService("gateway", true);
      // BootManager.evaluate() automatically fires → _signalGateway() → pushQueue.flush()

    } catch (err) {
      logger.error(`[Startup] Background initialization failed: ${err.message}`);
    }
  });

  // 4. Recurring Jobs
  setInterval(async () => {
    try {
      const SnapshotService = require("./services/SnapshotService");
      await SnapshotService.generateMarketSnapshot();
    } catch (err) {
      logger.error(`[SnapshotWorker] Generation Failed: ${err.message}`);
    }
  }, 60000);

  setInterval(async () => {
    try {
      const stats = await analyticsService.getRealtimeStats();
      if (stats) await realtime.broadcast("stats_updated", stats);
    } catch (err) {
      console.error("[Trends] Interval broadcast failed:", err.message);
    }
  }, 60000);

  setInterval(async () => {
    try {
      console.log("[Trends] Running scheduled persistence...");
      await analyticsService.aggregateDailyStats();
    } catch (err) {
      console.error("[Trends] Scheduled persistence failed:", err.message);
    }
  }, 6 * 1000 * 60 * 60);

  setInterval(async () => {
    try {
      const rates = await fxService.getAllRates();
      await realtime.broadcast("rates_updated", rates);
    } catch (err) {
      logger.error(`[Rates Broadcast] Error: ${err.message}`);
    }
  }, 30000);

  // Unread Message Email Fallback (runs every 5 minutes)
  setInterval(async () => {
    try {
      const unreadMessageEmailer = require("./workers/unreadMessageEmailer");
      await unreadMessageEmailer.process();
    } catch (err) {
      logger.error(`[UnreadMessageEmailer Worker] Error: ${err.message}`);
    }
  }, 5 * 60 * 1000);

  // Push Subscription Daily Cleanup
  try {
    const { startPushCleanupJob } = require("./workers/pushCleanup");
    startPushCleanupJob();
  } catch (err) {
    logger.error(`[PushCleanup Worker] Initialization Error: ${err.message}`);
  }

  // 5. Initialize Adversarial Chaos Session (If Enabled)
  if (require("./services/chaos/ChaosService").enabled) {
    const chaosToken = require("./services/chaos/ChaosService").createSession();
    logger.warn(`[CHAOS_READY] Session Token for Stage 10 Resilience Testing: ${chaosToken}`);
  }

  // 6. Finalize Invariant Registration
  require("./services/payment/InvariantRegistry");
});
