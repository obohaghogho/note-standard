module.exports = function bootGate(req, res, next) {
  // Always pass through health + status probes
  if (
    req.path === "/api/health" ||
    req.path === "/health" ||
    req.path === "/api/boot/status" ||
    req.path === "/internal/boot-ready"
  ) {
    return next();
  }

  const state = global.BOOT_STATE;

  // ── Fast-path: API layer + workers up → serve requests immediately ──
  // The DB/gateway check is async (network round-trip to Supabase) and
  // fires via setImmediate. We do NOT block all traffic waiting for it.
  // Any DB errors will surface as real errors per-request, not 503.
  const fastReady = state && state.services && state.services.api && state.services.workers;
  if (fastReady || (state && state.ready)) {
    return next();
  }

  // Only block if the HTTP server itself hasn't bound yet (extremely rare race)
  return res.status(503).json({
    error: "SYSTEM_BOOTING",
    phase: state?.phase || "STARTING",
    message: "The system is currently starting up. Please retry in a moment."
  });
};
