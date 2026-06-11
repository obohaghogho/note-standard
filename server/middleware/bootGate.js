module.exports = function bootGate(req, res, next) {
  if (req.path === "/api/health" || req.path === "/health" || req.path === "/api/boot/status") {
    return next();
  }

  if (!global.BOOT_STATE || !global.BOOT_STATE.ready) {
    return res.status(503).json({
      error: "SYSTEM_BOOTING",
      phase: global.BOOT_STATE?.phase || "STARTING",
      message: "The system is currently starting up and not yet ready to accept requests."
    });
  }

  next();
};
