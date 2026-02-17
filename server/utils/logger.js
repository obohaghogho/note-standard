/**
 * Structured Logger
 */
const logger = {
  info: (message, context = {}) => {
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
    console.warn(
      JSON.stringify({
        level: "WARN",
        timestamp: new Date().toISOString(),
        message,
        ...context,
      }),
    );
  },
};

module.exports = logger;
