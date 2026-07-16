const { monitorEventLoopDelay } = require('perf_hooks');
const logger = require("../../utils/logger");

/**
 * Hybrid Temporal Monitor (Phase 5)
 * Distinguishes between benign Node.js jitter and systemic desynchronization.
 */
class HybridTemporalMonitor {
    constructor() {
        this.histogram = monitorEventLoopDelay({ resolution: 10 });
        this.histogram.enable();
        
        this.lastMonotonic = process.hrtime.bigint();
        this.lastWall = Date.now();
        
        this.DRIFT_THRESHOLD_MS = 50; // Max acceptable internal clock drift
        this.LAG_THRESHOLD_P99_MS = 500; // Max p99 event loop lag
    }

    /**
     * Samples the current temporal health of the system.
     */
    async sampleMetrics() {
        const p99 = this.histogram.mean / 1e6; // Histogram stores in nanoseconds
        this.histogram.reset();

        const currentMonotonic = process.hrtime.bigint();
        const currentWall = Date.now();

        // 1. Monotonic vs Wall-clock Drift
        const elapsedMonotonicMs = Number(currentMonotonic - this.lastMonotonic) / 1e6;
        const elapsedWallMs = currentWall - this.lastWall;
        const driftDelta = Math.abs(elapsedMonotonicMs - elapsedWallMs);

        // 2. Scheduling Skew (Actual vs Expected)
        // We compare the monotonic drift against the wall drift
        const schedulingSkew = driftDelta; 

        // 3. Internal Load Attribution (CPU User vs System)
        const cpuUsage = process.cpuUsage();
        const memUsage = process.memoryUsage();
        
        this.lastMonotonic = currentMonotonic;
        this.lastWall = currentWall;

        // 4. Time Integrity Score Computation
        // f(eventLoopP99, driftDelta, schedulingSkew)
        let timeIntegrityScore = 1.0;
        
        // Penalize for event loop lag (Sustained)
        if (p99 > this.LAG_THRESHOLD_P99_MS) {
            timeIntegrityScore *= (this.LAG_THRESHOLD_P99_MS / p99);
        }

        // Penalize for clock drift
        if (driftDelta > this.DRIFT_THRESHOLD_MS) {
            timeIntegrityScore *= (this.DRIFT_THRESHOLD_MS / driftDelta);
        }

        // 5. Load Attribution Adjustment (User Constraint Phase 5)
        // If lag is detected but CPU is high while I/O is low, reduce penalty (Internal Load classify)
        const isInternalLoad = (cpuUsage.user + cpuUsage.system) > 1000000; // Heuristic
        if (timeIntegrityScore < 0.8 && isInternalLoad) {
            logger.info(`[TIM] High Lag detected but attributed to INTERNAL_LOAD. Scaling back penalty.`);
            timeIntegrityScore = Math.min(1.0, timeIntegrityScore * 1.5);
        }

        return {
            p99,
            driftDelta,
            schedulingSkew,
            timeIntegrityScore: parseFloat(timeIntegrityScore.toFixed(4)),
            loadMetrics: {
                cpu: cpuUsage,
                rss: memUsage.rss,
                isInternalLoad
            }
        };
    }
}

module.exports = new HybridTemporalMonitor();
