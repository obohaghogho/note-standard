/**
 * correlationId.js — Server-Side Correlation ID Middleware
 *
 * Reads X-Correlation-ID from incoming requests.
 * Generates a new one if absent.
 * Attaches it to req.correlationId for use in all downstream controllers.
 * Returns it in the response via X-Correlation-ID header.
 *
 * IMPORTANT: This middleware is ADDITIVE ONLY.
 * It does not modify request bodies, query params, or any business logic.
 * It does not block, reject, or rate-limit any request.
 */

const { randomUUID } = require('crypto');

/**
 * Validates that a string looks like a legitimate correlation ID.
 * Accepts both our cid_<ts>_<rand> format and standard UUID v4 from upstream proxies.
 */
function isValidCorrelationId(value) {
  if (typeof value !== 'string') return false;
  if (value.length > 128) return false; // Prevent header injection
  // Our format: cid_<timestamp>_<random>
  if (/^cid_\d+_[a-z0-9]+$/.test(value)) return true;
  // Standard UUID v4 (from upstream proxies/load balancers)
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return true;
  return false;
}

/**
 * Express middleware.
 *
 * Usage in app.js (must be before all routes):
 *   const correlationId = require('./middleware/correlationId');
 *   app.use(correlationId);
 */
const correlationId = (req, res, next) => {
  const incoming = req.headers['x-correlation-id'];

  // Accept the client's correlation ID if it's valid; generate one otherwise.
  const cid = isValidCorrelationId(incoming)
    ? incoming
    : `cid_${Date.now()}_${randomUUID().replace(/-/g, '').slice(0, 6)}`;

  // Attach to request for downstream use
  req.correlationId = cid;

  // Echo back in response so the client can match API responses to its own logs
  res.setHeader('X-Correlation-ID', cid);

  next();
};

module.exports = correlationId;
