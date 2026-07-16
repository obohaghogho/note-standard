const crypto = require('crypto');

/**
 * BUCKETED TIMING SHIELD (Anti-Side-Channel, Anti-Timing Analysis)
 *
 * Architecture:
 * - Defines fixed timing buckets (300ms, 350ms, 400ms)
 * - ALL code paths resolve in the SAME bucket regardless of outcome
 * - No early returns before timing boundary is reached
 * - Random jitter within bucket prevents statistical averaging
 */
const TIMING_BUCKETS_MS = [300, 350, 400];

/**
 * Select a random timing bucket for this request.
 * The bucket is chosen at request START, before any logic runs.
 * This ensures ALL response paths (success, auth failure, decrypt error, schema error)
 * are normalized to the same timing window.
 */
const selectBucket = () => {
    const idx = crypto.randomInt(0, TIMING_BUCKETS_MS.length);
    return TIMING_BUCKETS_MS[idx];
};

/**
 * timingShield middleware
 * Mount before all route handlers on sensitive routes.
 */
const timingShield = () => (req, res, next) => {
    const targetMs = selectBucket();
    const startHr = process.hrtime.bigint();

    const scheduleResponse = (fn, ...args) => {
        const nowHr = process.hrtime.bigint();
        const elapsedMs = Number(nowHr - startHr) / 1e6;

        // Remaining time to hit target bucket
        const remaining = Math.max(0, targetMs - elapsedMs);

        // Add micro-jitter within 10ms to prevent bucket fingerprinting
        const jitter = crypto.randomInt(0, 10);

        setTimeout(() => fn(...args), remaining + jitter);
    };

    // Intercept ALL response methods — no early returns allowed
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);
    const originalEnd = res.end.bind(res);

    let fired = false;

    const once = (fn) => (...args) => {
        if (fired) return;
        fired = true;
        scheduleResponse(fn, ...args);
    };

    res.json = once(originalJson);
    res.send = once(originalSend);
    res.end = once(originalEnd);

    next();
};

module.exports = timingShield;
