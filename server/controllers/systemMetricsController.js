const os = require('os');
const supabase = require('../config/database');

// Simple event loop lag detector
let eventLoopLagMs = 0;
let lastCheck = Date.now();

setInterval(() => {
  const now = Date.now();
  const delta = now - lastCheck;
  eventLoopLagMs = Math.max(0, delta - 500); // Expect ~500ms
  lastCheck = now;
}, 500).unref();

/**
 * Controller to expose system health, memory, and performance telemetry
 * for monitoring dashboards, uptime monitors, or Prometheus scrapers.
 */
exports.getSystemMetrics = async (req, res) => {
  const mem = process.memoryUsage();
  
  // Format memory into Megabytes (MB)
  const memoryStats = {
    rssMb: +(mem.rss / (1024 * 1024)).toFixed(2),
    heapTotalMb: +(mem.heapTotal / (1024 * 1024)).toFixed(2),
    heapUsedMb: +(mem.heapUsed / (1024 * 1024)).toFixed(2),
    externalMb: +(mem.external / (1024 * 1024)).toFixed(2),
    heapUtilizationPct: +((mem.heapUsed / mem.heapTotal) * 100).toFixed(1)
  };

  // Measure database latency
  const dbStart = Date.now();
  let dbHealthy = false;
  let dbLatencyMs = null;

  try {
    const { error } = await supabase.from('profiles').select('id').limit(1);
    dbLatencyMs = Date.now() - dbStart;
    dbHealthy = !error;
  } catch (err) {
    dbHealthy = false;
  }

  const uptimeSeconds = Math.floor(process.uptime());
  const hours = Math.floor(uptimeSeconds / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const seconds = uptimeSeconds % 60;

  const telemetry = {
    status: dbHealthy ? 'healthy' : 'degraded',
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    uptime: {
      seconds: uptimeSeconds,
      formatted: `${hours}h ${minutes}m ${seconds}s`
    },
    performance: {
      eventLoopLagMs: eventLoopLagMs,
      cpuLoadAvg: os.loadavg(),
      cpuCount: os.cpus().length,
      freeSystemMemoryMb: +(os.freemem() / (1024 * 1024)).toFixed(2),
      totalSystemMemoryMb: +(os.totalmem() / (1024 * 1024)).toFixed(2)
    },
    memory: memoryStats,
    database: {
      connected: dbHealthy,
      latencyMs: dbLatencyMs
    },
    boot: {
      bootReady: global.__BOOT_READY__ || false
    }
  };

  res.json(telemetry);
};
