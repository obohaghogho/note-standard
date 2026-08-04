const Sentry = require("@sentry/node");
const env = require("./env");

const SENTRY_DSN = process.env.SENTRY_DSN;
const IS_PROD = env.NODE_ENV === "production";

function initServerSentry() {
  if (!SENTRY_DSN) {
    console.info("[Observability] Sentry DSN not configured on server. Monitoring disabled.");
    return;
  }

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: env.NODE_ENV || "development",
    tracesSampleRate: IS_PROD ? 0.2 : 1.0,
    
    // Data Scrubbing to protect secrets, database credentials, and tokens
    beforeSend(event) {
      if (event.request && event.request.headers) {
        delete event.request.headers["authorization"];
        delete event.request.headers["Authorization"];
        delete event.request.headers["cookie"];
        delete event.request.headers["Cookie"];
      }

      // Sanitize request bodies containing passwords or secrets
      if (event.request && event.request.data) {
        try {
          if (typeof event.request.data === "object") {
            const sanitized = { ...event.request.data };
            ["password", "token", "secret", "apiKey", "privateKey"].forEach(k => {
              if (sanitized[k]) sanitized[k] = "[REDACTED]";
            });
            event.request.data = sanitized;
          }
        } catch {
          // ignore parsing error
        }
      }

      return event;
    }
  });

  console.info("[Observability] Sentry initialized successfully on API server.");
}

/**
 * Express middleware to attach correlation ID and user ID to Sentry scope
 */
function sentryContextMiddleware(req, res, next) {
  if (!SENTRY_DSN) return next();

  Sentry.withScope((scope) => {
    if (req.correlationId) {
      scope.setTag("correlation_id", req.correlationId);
    }
    if (req.user) {
      scope.setUser({
        id: req.user.id,
        email: req.user.email,
      });
    }
    next();
  });
}

/**
 * Capture handled backend exceptions with additional context
 */
function captureServerException(err, context = {}) {
  if (!SENTRY_DSN) {
    return;
  }
  Sentry.withScope((scope) => {
    scope.setExtras(context);
    Sentry.captureException(err);
  });
}

module.exports = {
  Sentry,
  initServerSentry,
  sentryContextMiddleware,
  captureServerException
};
