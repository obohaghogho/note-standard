/**
 * Fincra Integration — Secure HTTP Client
 * ────────────────────────────────────────
 * Creates an isolated Axios instance configured specifically for the Fincra API.
 * The API key is injected server-side only; NEVER exposed to the frontend.
 *
 * Authentication: Fincra uses the `api-key` header (not Bearer).
 * Feature flag:   Module will throw FincraDisabledError if ENABLE_FINCRA=false.
 */

const axios   = require("axios");
const logger  = require("../../utils/logger");
const { FincraApiError, FincraDisabledError } = require("./errors");
const { FINCRA_HTTP_TIMEOUT_MS } = require("./constants");

function assertFincraEnabled() {
  if (process.env.ENABLE_FINCRA !== "true") {
    throw new FincraDisabledError();
  }
}

function createFincraClient() {
  assertFincraEnabled();

  const apiKey    = (process.env.FINCRA_API_KEY    || "").trim();
  const baseURL   = (process.env.FINCRA_BASE_URL   || "https://sandboxapi.fincra.com").trim();
  const businessId = (process.env.FINCRA_BUSINESS_ID || "").trim();

  if (!apiKey) {
    logger.error("[Fincra/client] FINCRA_API_KEY is not configured.");
    throw new Error("[Fincra] FINCRA_API_KEY is missing from environment configuration.");
  }

  const instance = axios.create({
    baseURL,
    timeout: FINCRA_HTTP_TIMEOUT_MS,
    headers: {
      "api-key":      apiKey,
      "Content-Type": "application/json",
      "Accept":       "application/json",
    },
  });

  // ── Request Interceptor: logging ──────────────────────────────────────────
  instance.interceptors.request.use(
    (config) => {
      logger.info(`[Fincra] → ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    },
    (error) => Promise.reject(error)
  );

  // ── Response Interceptor: normalize errors ────────────────────────────────
  instance.interceptors.response.use(
    (response) => {
      logger.info(`[Fincra] ← ${response.status} ${response.config.url}`);
      return response;
    },
    (error) => {
      const status  = error.response?.status;
      const data    = error.response?.data;
      const message = data?.message || data?.error || error.message || "Fincra API error";

      logger.error(`[Fincra] API Error ${status}: ${message}`, { url: error.config?.url, data });
      return Promise.reject(new FincraApiError(message, status, data));
    }
  );

  return { instance, businessId };
}

// Export a lazy getter so the client is only instantiated on demand
// (respects the ENABLE_FINCRA flag at call time).
function getFincraClient() {
  return createFincraClient();
}

module.exports = { getFincraClient, assertFincraEnabled };
