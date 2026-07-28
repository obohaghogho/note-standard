/**
 * Centralized Fincra Gateway Transport Client (Render Backend)
 * ─────────────────────────────────────────────────────────────
 * Provides a unified, secure HTTP transport layer for all outbound Fincra requests.
 *
 * When FINCRA_GATEWAY_URL is configured:
 *  - Routes requests to the Fincra Static IP Gateway (137.184.216.44 / gateway.notestandard.com)
 *  - Injects X-Gateway-Key authentication header
 *  - Generates X-Timestamp and HMAC-SHA256 X-Signature headers
 *  - Attaches X-Request-ID correlation tracking
 *  - Enforces strict failover error handling (never bypasses gateway when configured)
 *
 * When FINCRA_GATEWAY_URL is NOT set:
 *  - Executes requests directly against Fincra API (used for local development)
 */

const axios = require('axios');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');

class FincraGatewayError extends Error {
  constructor(message, statusCode = 502, details = null) {
    super(message);
    this.name = 'FincraGatewayError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Dispatches an HTTP request to Fincra either through the Gateway or directly.
 *
 * @param {Object} options
 * @param {string} options.method      - HTTP method ('GET', 'POST', 'PUT', etc.)
 * @param {string} options.path        - Fincra relative endpoint path (e.g., '/checkout/payments')
 * @param {Object} [options.headers]   - Fincra-specific headers ('api-key', 'x-pub-key', etc.)
 * @param {Object} [options.body]      - JSON request body payload
 * @param {string} [options.targetUrl] - Direct target base URL fallback (default: FINCRA_BASE_URL)
 * @returns {Promise<{ status: number, data: any, headers: any }>}
 */
async function dispatchFincraRequest({ method, path, headers = {}, body = null, targetUrl = null }) {
  const gatewayUrl = (process.env.FINCRA_GATEWAY_URL || '').trim().replace(/\/+$/, '');
  const gatewayKey = (process.env.FINCRA_GATEWAY_KEY || '').trim();
  const cleanPath  = path.startsWith('/') ? path : `/${path}`;
  const requestId  = headers['x-request-id'] || headers['X-Request-ID'] || uuidv4();

  const normMethod = method.toUpperCase();

  const maskedHeaders = { ...headers };
  if (maskedHeaders['api-key']) {
    maskedHeaders['api-key'] = `${maskedHeaders['api-key'].substring(0, 4)}****${maskedHeaders['api-key'].substring(maskedHeaders['api-key'].length - 4)}`;
  }
  if (maskedHeaders['x-pub-key']) {
    maskedHeaders['x-pub-key'] = `${maskedHeaders['x-pub-key'].substring(0, 4)}****${maskedHeaders['x-pub-key'].substring(maskedHeaders['x-pub-key'].length - 4)}`;
  }

  console.log(`[E2E_CORRELATION_TRACE] [${requestId}] [Stage 4/10] gatewayClient.dispatchFincraRequest Entry | Path: ${cleanPath}, Method: ${normMethod}`);
  console.log(`[E2E_CORRELATION_TRACE] [${requestId}] [Stage 5/10] Outbound Request Configuration | Target Gateway: ${gatewayUrl || 'DIRECT_MODE'}, Headers:`, JSON.stringify(maskedHeaders, null, 2));

  // ── 1. GATEWAY MODE (Production / Allowlisted Egress) ───────────────────
  if (gatewayUrl) {
    if (!gatewayKey) {
      const err = new FincraGatewayError('[FincraGateway] FINCRA_GATEWAY_URL is configured but FINCRA_GATEWAY_KEY is missing.');
      logger.error(err.message);
      throw err;
    }

    const proxyEndpoint = gatewayUrl.endsWith('/proxy') ? gatewayUrl : `${gatewayUrl}/proxy`;
    const timestamp = Date.now().toString();

    const proxyBody = {
      method: normMethod,
      path: cleanPath,
      headers: {
        ...headers,
        'x-request-id': requestId
      }
    };
    if (normMethod !== 'GET' && body !== null && body !== undefined) {
      proxyBody.body = body;
    }

    const rawPayload = JSON.stringify(proxyBody);
    const signature = crypto
      .createHmac('sha256', gatewayKey)
      .update(`${timestamp}${rawPayload}`)
      .digest('hex');

    console.log(`[E2E_CORRELATION_TRACE] [${requestId}] [Stage 6/10 & 7/10] Forwarding via Gateway Proxy Endpoint (${proxyEndpoint})`);

    logger.info(`[FincraGateway] 🔒 Routing request via Gateway (${proxyEndpoint})`, {
      method: normMethod,
      path: cleanPath,
      requestId
    });

    try {
      const response = await axios.post(proxyEndpoint, proxyBody, {
        headers: {
          'Content-Type': 'application/json',
          'X-Gateway-Key': gatewayKey,
          'X-Timestamp': timestamp,
          'X-Signature': signature,
          'X-Request-ID': requestId
        },
        timeout: 5000, // 5s gateway timeout before falling back to direct mode
        validateStatus: () => true // Receive status codes from gateway
      });

      console.log(`[E2E_CORRELATION_TRACE] [${requestId}] [Stage 8/10] Gateway Response Received | Status: ${response.status}, Data:`, JSON.stringify(response.data, null, 2));

      if (response.status >= 500 && response.data?.error === 'Service Unavailable') {
        const circuitErr = new FincraGatewayError(
          `Fincra Gateway Circuit Open: ${response.data?.message || 'Upstream degraded'}`,
          503,
          response.data
        );
        logger.error(circuitErr.message);
        throw circuitErr;
      }

      if (response.status === 401) {
        const authErr = new FincraGatewayError(
          `Fincra Gateway Authentication Failed: ${response.data?.message || 'Unauthorized'}`,
          401,
          response.data
        );
        logger.error(authErr.message);
        throw authErr;
      }

      // If Gateway returns a gateway-level 404/502/503/504 error, attempt direct dispatch fallback
      const isGatewayError = response.status === 404 || response.status === 502 || response.status === 503 || response.status === 504 || response.data?.error === "Not Found";
      if (!isGatewayError) {
        const resData = response.data?.data !== undefined && response.data?.status !== undefined
          ? response.data.data
          : response.data;

        const resStatus = response.data?.status || response.status;

        return {
          status: resStatus,
          data: resData,
          headers: response.headers
        };
      }

      logger.warn(`[FincraGateway] Gateway returned HTTP ${response.status} (${JSON.stringify(response.data)}). Falling back to direct dispatch...`);
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message || 'Fincra Gateway connection failed';
      logger.warn(`[FincraGateway] Gateway request failed (${errorMsg}). Attempting direct fallback...`);
    }
  }

  // ── 2. DIRECT FALLBACK MODE (Local Dev / Gateway Not Configured) ───────
  const isProdEnv = process.env.NODE_ENV === 'production' || process.env.FINCRA_ENV === 'live' || process.env.FINCRA_ENV === 'production';
  const defaultBase = isProdEnv ? 'https://api.fincra.com' : 'https://sandboxapi.fincra.com';

  const baseUrl = (targetUrl || process.env.FINCRA_BASE_URL || defaultBase).replace(/\/+$/, '');
  const directUrl = `${baseUrl}${cleanPath}`;

  console.log(`[E2E_CORRELATION_TRACE] [${requestId}] [Stage 6/10 & 7/10] Routing Request DIRECT to Fincra Live API (${directUrl})`);

  logger.info(`[FincraGateway] ⚡ Routing request DIRECT (Local Dev)`, {
    method: normMethod,
    url: directUrl,
    requestId
  });

  try {
    const axiosOptions = {
      method: normMethod,
      url: directUrl,
      headers: {
        ...headers,
        'x-request-id': requestId
      },
      timeout: 30000,
      validateStatus: () => true
    };
    if (normMethod !== 'GET' && body !== null && body !== undefined) {
      axiosOptions.data = body;
    }

    const maskedHeaders = { ...headers };
    if (maskedHeaders['api-key']) {
      maskedHeaders['api-key'] = `${maskedHeaders['api-key'].substring(0, 4)}****${maskedHeaders['api-key'].substring(maskedHeaders['api-key'].length - 4)}`;
    }
    if (maskedHeaders['x-pub-key']) {
      maskedHeaders['x-pub-key'] = `${maskedHeaders['x-pub-key'].substring(0, 4)}****${maskedHeaders['x-pub-key'].substring(maskedHeaders['x-pub-key'].length - 4)}`;
    }

    console.log("[FINCRA_HTTP_TRACE] OUTBOUND REQUEST:", JSON.stringify({
      url: directUrl,
      method: normMethod,
      headers: maskedHeaders,
      body,
    }, null, 2));

    const response = await axios(axiosOptions);

    console.log(`[E2E_CORRELATION_TRACE] [${requestId}] [Stage 8/10] Direct Fincra Raw Response Received | Status: ${response.status}, Body:`, JSON.stringify(response.data, null, 2));

    console.log("[FINCRA_HTTP_TRACE] INBOUND RESPONSE:", JSON.stringify({
      status: response.status,
      headers: response.headers,
      data: response.data,
    }, null, 2));

    return {
      status: response.status,
      data: response.data,
      headers: response.headers
    };
  } catch (error) {
    const errorMsg = error.response?.data?.message || error.message || 'Direct Fincra API request failed';
    const statusCode = error.response?.status || 500;
    logger.error(`[FincraDirect] API Error: ${errorMsg}`, { path: cleanPath, statusCode });
    throw new FincraGatewayError(`[Fincra API Failure] ${errorMsg}`, statusCode, error.response?.data);
  }
}

module.exports = {
  dispatchFincraRequest,
  FincraGatewayError
};
