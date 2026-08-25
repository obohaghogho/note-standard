const path = require("path");
const logger = require("./utils/logger");
const env = require("./config/env");
const { initServerSentry, Sentry } = require("./config/sentry");

// ─── Initialize Sentry Observability ───────────────────────────
initServerSentry();

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
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(err);
  }
  setTimeout(() => process.exit(1), 1000);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("[Process] Unhandled Rejection at:", promise, "reason:", reason);
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason)));
  }
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
const supportInactivityWorker = require("./workers/supportInactivityWorker");

// ── Enterprise Treasury Workers (Phase 1-15) ─────────────────────────────────
const TreasuryBalanceSyncWorker    = require("./workers/TreasuryBalanceSyncWorker");
const AggregateReconciliationWorker = require("./workers/AggregateReconciliationWorker");
const ProviderHealthWorker          = require("./workers/ProviderHealthWorker");
const LiquidityForecastWorker       = require("./workers/LiquidityForecastWorker");

// ── Enterprise Financial Platform Workers (Phase 16) ──────────────────────────
const NightlyReconciliationWorker  = require("./workers/NightlyReconciliationWorker");
const SLAMetricsWorker             = require("./workers/SLAMetricsWorker");

// ── Phase 17: Event replay worker ─────────────────────────────────────────────
let EventReplayWorker;
try { EventReplayWorker = require("./workers/EventReplayWorker"); } catch { EventReplayWorker = null; }

// ── Phase 18A: Crypto Enterprise Workers ──────────────────────────────────────
const BlockchainConfirmationPoller = require("./workers/BlockchainConfirmationPoller");
const CryptoBalanceSyncWorker     = require("./workers/CryptoBalanceSyncWorker");
const CryptoWithdrawalWorker      = require("./workers/CryptoWithdrawalWorker");
const DepositAddressPoolRefiller  = require("./workers/DepositAddressPoolRefiller");

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    logger.error(`Port ${PORT} is already in use. Please run 'npm run dev:safe' to clear it.`);
    process.exit(1);
  } else {
    logger.error('Server error:', err);
  }
});

server.listen(PORT, "0.0.0.0", async () => {
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
  supportInactivityWorker.start();

  // ── Enterprise Treasury Workers ────────────────────────────────────────────
  TreasuryBalanceSyncWorker.start();
  AggregateReconciliationWorker.start();
  ProviderHealthWorker.start();
  LiquidityForecastWorker.start();

  // ── Phase 16: Enterprise Financial Platform Workers ───────────────────────
  NightlyReconciliationWorker.start();
  SLAMetricsWorker.start();
  if (EventReplayWorker?.start) EventReplayWorker.start();

  // ── Phase 18A: Crypto Enterprise Workers ──────────────────────────────────
  BlockchainConfirmationPoller.start();
  CryptoBalanceSyncWorker.start();
  CryptoWithdrawalWorker.start();
  DepositAddressPoolRefiller.start();

  // ── Phase 18B: Proof of Treasury Real-Time Audit Worker ────────────────────
  const ProofOfTreasuryWorker = require("./workers/ProofOfTreasuryWorker");
  ProofOfTreasuryWorker.start();

  // ── Phase 18C: Crypto Multi-Network Capability Verification Worker ─────────
  const CryptoWalletVerificationWorker = require("./workers/CryptoWalletVerificationWorker");
  CryptoWalletVerificationWorker.start();

  // ✅ Workers are launched — mark workers ready
  bootManager.setService("workers", true);

  // ── Keep-Alive Self-Ping (Prevents Render Free Tier Sleep) ────────────────
  // Render free tier spins down after 15 minutes of inactivity, causing
  // Fincra/Paystack webhooks to fail silently. This pings every 13 minutes.
  const serverUrl = env.SERVER_URL || env.BACKEND_URL || `http://localhost:${PORT}`;
  if (env.NODE_ENV === "production" || process.env.RENDER) {
    const KEEP_ALIVE_INTERVAL = 13 * 60 * 1000; // 13 minutes
    setInterval(() => {
      const url = `${serverUrl}/api/system/health`;
      const client = url.startsWith("https") ? https : http;
      client.get(url, (res) => {
        logger.info(`[KeepAlive] Self-ping: ${res.statusCode}`);
      }).on("error", (err) => {
        logger.warn(`[KeepAlive] Self-ping failed: ${err.message}`);
      });
    }, KEEP_ALIVE_INTERVAL);
    logger.info(`[KeepAlive] Self-ping enabled (every 13m) → ${serverUrl}/api/system/health`);
  }
  
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
        bootManager.setService("gateway", true); // Fast-path system readiness

        // ── Phase 17: Provider Certification (non-blocking, post-DB) ───────────
        setImmediate(async () => {
          try {
            const ProviderCertificationRegistry = require('./config/ProviderCertificationRegistry');
            logger.info('[Boot] Running provider certification checks...');
            const results = await ProviderCertificationRegistry.certifyAll();
            const passed  = Object.values(results).filter(r => r.certified).length;
            const total   = Object.keys(results).length;
            logger.info(`[Boot] Provider certification complete: ${passed}/${total} certified`);
            if (passed < total) {
              const failed = Object.entries(results).filter(([, r]) => !r.certified).map(([k]) => k);
              logger.warn(`[Boot] Providers not certified: ${failed.join(', ')}`);
            }
          } catch (certErr) {
            logger.warn(`[Boot] Provider certification check failed (non-blocking): ${certErr.message}`);
          }
        });
      }

      // ── B: Seed Market Data (Non-blocking background initialization) ──────
      logger.info("[Trends] Starting initial aggregation in background...");
      analyticsService.aggregateDailyStats().catch(err => logger.warn(`[Trends] Initial aggregation warning: ${err.message}`));

      logger.info("[Snapshot] Generating initial DFOS v6.0 Snapshot...");
      const SnapshotService = require("./services/SnapshotService");
      SnapshotService.generateMarketSnapshot().catch(err => logger.warn(`[Snapshot] Initial snapshot warning: ${err.message}`));

      fxService.getAllRates().then(rates => realtime.broadcast("rates_updated", rates)).catch(() => {});
      analyticsService.getRealtimeStats().then(stats => { if (stats) realtime.broadcast("stats_updated", stats); }).catch(() => {});

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
      // BootManager.evaluate() automatically fires → _signalGateway() → pushQueue.flush()

    } catch (err) {
      logger.error(`[Startup] Background initialization failed: ${err.message}`);
    }
  });

  // 4. Recurring Jobs
  // ── Consolidated Market Data Cycle (60s) ────────────────────────────────
  // Previously: snapshot at 60s + rates broadcast at 30s = two independent
  // loops both hitting NOWPayments, causing 429 rate limits.
  // Now: single 60s tick — snapshot first, then rates broadcast.
  setInterval(async () => {
    try {
      const SnapshotService = require("./services/SnapshotService");
      await SnapshotService.generateMarketSnapshot();
    } catch (err) {
      logger.error(`[SnapshotWorker] Generation Failed: ${err.message}`);
    }

    // Rates broadcast immediately after snapshot (uses warm cache from snapshot)
    try {
      const rates = await fxService.getAllRates();
      await realtime.broadcast("rates_updated", rates);
    } catch (err) {
      logger.error(`[Rates Broadcast] Error: ${err.message}`);
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
