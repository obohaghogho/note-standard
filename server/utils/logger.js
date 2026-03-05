/**
 * Structured Logger
 * Respects LOG_LEVEL env var: error > warn > info > debug
 */
const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel =
  LOG_LEVELS[(process.env.LOG_LEVEL || "info").toLowerCase()] ??
    LOG_LEVELS.info;

const logger = {
  info: (message, context = {}) => {
    if (currentLevel < LOG_LEVELS.info) return;
    console.log(
      JSON.stringify({
        level: "INFO",
        timestamp: new Date().toISOString(),
        message,
        ...context,
      }),
    );
  },
  error: (message, context = {}) => {
    console.error(
      JSON.stringify({
        level: "ERROR",
        timestamp: new Date().toISOString(),
        message,
        ...context,
      }),
    );
  },
  warn: (message, context = {}) => {
    if (currentLevel < LOG_LEVELS.warn) return;
    console.warn(
      JSON.stringify({
        level: "WARN",
        timestamp: new Date().toISOString(),
        message,
        ...context,
      }),
    );
  },
  debug: (message, context = {}) => {
    if (currentLevel < LOG_LEVELS.debug) return;
    // Also respect legacy DEBUG=true flag
    if (
      process.env.DEBUG === "true" || process.env.NODE_ENV === "development"
    ) {
      console.log(
        JSON.stringify({
          level: "DEBUG",
          timestamp: new Date().toISOString(),
          message,
          ...context,
        }),
      );
    }
  },
};

module.exports = logger;
