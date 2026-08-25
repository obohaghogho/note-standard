/**
 * Fincra Webhook Route — ISOLATED from existing webhooks.js
 * Endpoint: POST /api/webhooks/fincra
 *
 * SAFETY:
 *  - server/routes/webhooks.js is NOT modified.
 *  - This route is mounted separately in app.js via:
 *      app.use("/api/webhooks/fincra", fincraWebhookRoutes);
 *  - Raw body is preserved for HMAC SHA-512 signature verification.
 */

const express = require("express");
const router  = express.Router();
const { processFincraWebhook } = require("../services/fincra/webhook");
const { FincraSignatureError, FincraDuplicateEventError, FincraDisabledError } = require("../services/fincra/errors");
const logger  = require("../utils/logger");

/**
 * POST /api/webhooks/fincra
 *
 * Accepts raw body (express.raw) to preserve byte-for-byte body for HMAC verification.
 * The raw body middleware must be applied BEFORE json parsing for this route.
 */
router.post(
  "/",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    // ── Body Resolution ─────────────────────────────────────────────────
    // express.json() in app.js may have ALREADY parsed the body before this
    // route runs. In that case:
    //   - req.body = parsed JS object (NOT Buffer)
    //   - req.rawBody = original Buffer (saved by express.json's verify callback)
    // If express.raw() captured it first (unlikely given mount order):
    //   - req.body = Buffer
    let rawBody;
    let parsedBody;

    if (req.body instanceof Buffer) {
      // express.raw() captured it — ideal case
      rawBody = req.body.toString("utf8");
      try { parsedBody = JSON.parse(rawBody); } catch { 
        return res.status(400).json({ error: "Invalid JSON body" }); 
      }
    } else if (typeof req.body === 'object' && req.body !== null) {
      // express.json() already parsed — most common case in production
      parsedBody = req.body;
      // Use the raw Buffer saved by express.json()'s verify callback for HMAC
      rawBody = req.rawBody instanceof Buffer ? req.rawBody.toString("utf8") : JSON.stringify(parsedBody);
    } else if (typeof req.body === 'string') {
      rawBody = req.body;
      try { parsedBody = JSON.parse(rawBody); } catch {
        return res.status(400).json({ error: "Invalid JSON body" });
      }
    } else {
      logger.warn("[Fincra/webhookRoute] No parseable body found.", { bodyType: typeof req.body });
      return res.status(400).json({ error: "No body received" });
    }

    logger.info(`[Fincra/webhookRoute] Incoming webhook event: ${parsedBody.event || parsedBody.type || "unknown"}`);

    try {
      const result = await processFincraWebhook(req.headers, rawBody, parsedBody);

      // Always return 200 OK to prevent Fincra from retrying successfully processed events
      return res.status(200).json({ success: true, ...result });

    } catch (err) {
      if (err instanceof FincraSignatureError) {
        logger.warn(`[Fincra/webhookRoute] Signature rejection: ${err.message}`);
        return res.status(401).json({ error: err.message });
      }

      if (err instanceof FincraDuplicateEventError) {
        // Return 200 to Fincra so they don't retry a duplicate event
        return res.status(200).json({ success: true, message: "Duplicate event ignored." });
      }

      if (err instanceof FincraDisabledError) {
        return res.status(503).json({ error: "Fincra integration is currently disabled." });
      }

      logger.error(`[Fincra/webhookRoute] Unhandled webhook error: ${err.message}`, err);
      // Return 200 for non-fatal processing errors to prevent unnecessary Fincra retries
      return res.status(200).json({ success: false, error: err.message });
    }
  }
);

module.exports = router;
