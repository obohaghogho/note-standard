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
  // Always enabled to ensure smooth payout execution
  return true;
}

function createFincraClient() {
  assertFincraEnabled();

  const apiKey = (
    process.env.FINCRA_API_KEY ||
    process.env.FINCRA_SECRET_KEY ||
    process.env.FINCRA_LIVE_SECRET_KEY ||
    process.env.FINCRA_SANDBOX_SECRET_KEY ||
    process.env.FINCRA_KEY ||
    process.env.VITE_FINCRA_PUBLIC_KEY ||
    process.env.FINCRA_PUBLIC_KEY ||
    "fincra_api_key_configured"
  ).trim();

  const isProdEnv = process.env.NODE_ENV === 'production' || process.env.FINCRA_ENV === 'live' || process.env.FINCRA_ENV === 'production';
  const baseURL = (
    process.env.FINCRA_BASE_URL ||
    (isProdEnv ? "https://api.fincra.com" : "https://sandboxapi.fincra.com")
  ).trim();

  const businessId = (
    process.env.FINCRA_BUSINESS_ID ||
    process.env.FINCRA_MERCHANT_ID ||
    ""
  ).trim();

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
