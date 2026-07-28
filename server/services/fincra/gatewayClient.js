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
        timeout: 35000,
        validateStatus: () => true // Receive status codes from gateway
      });

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

      // Gateway returns { status, data, headers }
      const resData = response.data?.data !== undefined && response.data?.status !== undefined
        ? response.data.data
        : response.data;

      const resStatus = response.data?.status || response.status;

      return {
        status: resStatus,
        data: resData,
        headers: response.headers
      };

    } catch (error) {
      if (error instanceof FincraGatewayError) throw error;

      const errorMsg = error.response?.data?.message || error.message || 'Fincra Gateway connection failed';
      const statusCode = error.response?.status || 502;

      logger.error(`[FincraGateway] ❌ Gateway Request Failed: ${errorMsg}`, {
        path: cleanPath,
        statusCode,
        requestId
      });

      // Strict enforcement: Never bypass gateway when configured
      throw new FincraGatewayError(`[Fincra Gateway Failure] ${errorMsg}`, statusCode, error.response?.data);
    }
  }

  // ── 2. DIRECT FALLBACK MODE (Local Dev / Gateway Not Configured) ───────
  const isProdEnv = process.env.NODE_ENV === 'production' || process.env.FINCRA_ENV === 'live' || process.env.FINCRA_ENV === 'production';
  const defaultBase = isProdEnv ? 'https://api.fincra.com' : 'https://sandboxapi.fincra.com';

  const baseUrl = (targetUrl || process.env.FINCRA_BASE_URL || defaultBase).replace(/\/+$/, '');
  const directUrl = `${baseUrl}${cleanPath}`;

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

    const response = await axios(axiosOptions);

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
