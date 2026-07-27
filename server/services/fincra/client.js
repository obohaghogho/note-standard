/**
 * Fincra Integration — Secure HTTP Client (Gateway Supported)
 * ────────────────────────────────────────────────────────────
 * Creates an isolated HTTP client configured specifically for Fincra API.
 * In production/allowlisted mode, routes outbound requests through the Fincra Static IP Gateway.
 */

const axios = require("axios");
const logger = require("../../utils/logger");
const { FincraApiError, FincraDisabledError } = require("./errors");
const { FINCRA_HTTP_TIMEOUT_MS } = require("./constants");
const { dispatchFincraRequest } = require("./gatewayClient");

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

  // Custom Axios Adapter delegating all HTTP requests to gatewayClient
  const gatewayAdapter = async (config) => {
    const method  = (config.method || 'get').toUpperCase();
    const reqPath = config.url || '';
    const headers = config.headers || {};
    let body = config.data;

    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch {}
    }

    try {
      const response = await dispatchFincraRequest({
        method,
        path: reqPath,
        headers: {
          ...headers,
          "api-key": apiKey
        },
        body,
        targetUrl: baseURL
      });

      if (response.status >= 400) {
        const error = new Error(`Fincra Request failed with status ${response.status}`);
        error.config = config;
        error.response = {
          status: response.status,
          data: response.data,
          headers: response.headers,
          config
        };
        throw error;
      }

      return {
        data: response.data,
        status: response.status,
        statusText: 'OK',
        headers: response.headers,
        config,
        request: {}
      };
    } catch (err) {
      if (err.response) throw err;
      const gatewayErr = new Error(err.message || 'Gateway transport error');
      gatewayErr.config = config;
      gatewayErr.response = {
        status: err.statusCode || 502,
        data: err.details || { error: err.message },
        headers: {},
        config
      };
      throw gatewayErr;
    }
  };

  const instance = axios.create({
    baseURL,
    timeout: FINCRA_HTTP_TIMEOUT_MS,
    adapter: gatewayAdapter,
    headers: {
      "api-key":      apiKey,
      "Content-Type": "application/json",
      "Accept":       "application/json",
    },
  });

  // Response Interceptor: normalize errors
  instance.interceptors.response.use(
    (response) => response,
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

function getFincraClient() {
  return createFincraClient();
}

module.exports = { getFincraClient, assertFincraEnabled };
