/**
 * Centralized Fincra Gateway Transport Client (Render Backend)
 * ─────────────────────────────────────────────────────────────
 * Provides a unified, secure HTTP transport layer for all outbound Fincra requests.
 *
 * ALL Fincra requests route strictly through gateway.notestandard.com (137.184.216.44).
 * Direct fallback to Fincra API is strictly disabled to prevent Render IPv6 leaks.
 * If the gateway is unreachable, the client fails fast with HTTP 503 SERVICE_UNAVAILABLE.
 */

const axios = require('axios');
const https = require('https');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');

// HTTPS Agent enforcing family: 4 (IPv4)
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
  freeSocketTimeout: 15000,
  rejectUnauthorized: true,
  family: 4, // Enforce IPv4 socket connection
});

class FincraGatewayError extends Error {
  constructor(message, statusCode = 503, details = null) {
    super(message);
    this.name = 'FincraGatewayError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

/**
 * Dispatches an HTTP request to Fincra through the Gateway.
 * Direct connections to Fincra are strictly disabled to enforce static IPv4 egress.
 *
 * @param {Object} options
 * @param {string} options.method      - HTTP method ('GET', 'POST', 'PUT', etc.)
 * @param {string} options.path        - Fincra relative endpoint path (e.g., '/checkout/payments')
 * @param {Object} [options.headers]   - Fincra-specific headers ('api-key', 'x-pub-key', etc.)
 * @param {Object} [options.body]      - JSON request body payload
 * @returns {Promise<{ status: number, data: any, headers: any }>}
 */
async function dispatchFincraRequest({ method, path, headers = {}, body = null }) {
  const defaultGateway = 'https://gateway.notestandard.com';
  const gatewayUrl = (process.env.FINCRA_GATEWAY_URL || defaultGateway).trim().replace(/\/+$/, '');
  const gatewayKey = (process.env.FINCRA_GATEWAY_KEY || '3dfd955a433a3eb100e2dc4763ec48b4b93ca85f0d722ffcfd1cbed6198319d9').trim();
  const cleanPath  = path.startsWith('/') ? path : `/${path}`;
  const requestId  = headers['x-request-id'] || headers['X-Request-ID'] || headers['x-correlation-id'] || headers['X-Correlation-ID'] || uuidv4();
  const correlationId = requestId;

  const normMethod = method.toUpperCase();
  const startTime = Date.now();

  const proxyEndpoint = gatewayUrl.endsWith('/proxy') ? gatewayUrl : `${gatewayUrl}/proxy`;
  const timestamp = Date.now().toString();

  const proxyBody = {
    method: normMethod,
    path: cleanPath,
    headers: {
      ...headers,
      'x-request-id': requestId,
      'x-correlation-id': correlationId,
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

  logger.info(`[FincraGateway] 🔒 Routing ${normMethod} ${cleanPath} via Gateway (${proxyEndpoint})`, {
    provider: 'FINCRA',
    requestId,
    correlationId,
    method: normMethod,
    path: cleanPath,
    family: 4,
    remoteIp: '137.184.216.44'
  });

  try {
    const response = await axios.post(proxyEndpoint, proxyBody, {
      headers: {
        'Content-Type': 'application/json',
        'X-Gateway-Key': gatewayKey,
        'X-Timestamp': timestamp,
        'X-Signature': signature,
        'X-Request-ID': requestId,
        'X-Correlation-ID': correlationId,
      },
      timeout: 30000,
      httpsAgent,
      validateStatus: () => true
    });

    const latencyMs = Date.now() - startTime;

    if (response.status >= 500 && response.data?.error === 'Service Unavailable') {
      const circuitErr = new FincraGatewayError(
        `Fincra Gateway Circuit Open: ${response.data?.message || 'Upstream degraded'}`,
        503,
        response.data
      );
      logger.error(circuitErr.message, {
        provider: 'FINCRA',
        requestId,
        correlationId,
        method: normMethod,
        path: cleanPath,
        status: 503,
        latencyMs,
        retry: 0,
        family: 4,
        remoteIp: '137.184.216.44',
        destination: `${gatewayUrl}${cleanPath}`
      });
      throw circuitErr;
    }

    if (response.status === 401) {
      const authErr = new FincraGatewayError(
        `Fincra Gateway Authentication Failed: ${response.data?.message || 'Unauthorized'}`,
        401,
        response.data
      );
      logger.error(authErr.message, {
        provider: 'FINCRA',
        requestId,
        correlationId,
        method: normMethod,
        path: cleanPath,
        status: 401,
        latencyMs,
        retry: 0,
        family: 4,
        remoteIp: '137.184.216.44',
        destination: `${gatewayUrl}${cleanPath}`
      });
      throw authErr;
    }

    // The gateway server wraps Fincra's response as: { status: <http_status>, data: <fincra_body>, headers: {...} }
    // `response.data` is the gateway wrapper; `response.data.data` is Fincra's actual response body.
    const fincraHttpStatus = response.data?.status || response.status;
    const fincraBody       = (response.data?.data !== undefined) ? response.data.data : response.data;

    // ── Detect Fincra IP restriction (403) and surface with clear action message ──
    const isIpRestriction =
      fincraHttpStatus === 403 ||
      (typeof fincraBody === 'object' && (
        fincraBody?.error?.toString().toLowerCase().includes('ip') ||
        fincraBody?.message?.toString().toLowerCase().includes('ip address')
      ));

    if (isIpRestriction) {
      const ipMsg = fincraBody?.error || fincraBody?.message || 'Your IP address is not allowed to access this service';
      const ipErr = new FincraGatewayError(
        `FINCRA_IP_RESTRICTION: Fincra rejected request from gateway (137.184.216.44): "${ipMsg}". ACTION REQUIRED: Whitelist 137.184.216.44 in Fincra Dashboard → Settings → API → IP Whitelist.`,
        403,
        fincraBody
      );
      logger.error(ipErr.message, {
        provider: 'FINCRA',
        requestId,
        correlationId,
        method: normMethod,
        path: cleanPath,
        status: 403,
        latencyMs,
        retry: 0,
        family: 4,
        remoteIp: '137.184.216.44',
        destination: `${gatewayUrl}${cleanPath}`,
        action: 'Whitelist 137.184.216.44 in Fincra Dashboard'
      });
      throw ipErr;
    }

    logger.info(`[FincraGateway] Gateway Request Completed`, {
      provider: 'FINCRA',
      requestId,
      correlationId,
      method: normMethod,
      path: cleanPath,
      status: fincraHttpStatus,
      latencyMs,
      retry: 0,
      family: 4,
      remoteIp: '137.184.216.44',
      destination: `${gatewayUrl}${cleanPath}`
    });

    return {
      status: fincraHttpStatus,
      data:   fincraBody,
      headers: response.headers
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;

    if (error instanceof FincraGatewayError) throw error;

    const errorMsg = error.response?.data?.message || error.message || 'Fincra Gateway connection failed';

    // Strict Fail-Fast Policy: NEVER fall back to direct Fincra URL.
    const gatewayFailErr = new FincraGatewayError(
      `[FincraGateway] GATEWAY_UNAVAILABLE: Gateway at ${proxyEndpoint} is unreachable (${errorMsg}). Direct Fincra access is strictly disabled to enforce static IPv4 egress.`,
      503,
      { gatewayUrl: proxyEndpoint, originalError: errorMsg }
    );

    logger.error(gatewayFailErr.message, {
      provider: 'FINCRA',
      requestId,
      correlationId,
      method: normMethod,
      path: cleanPath,
      status: 503,
      latencyMs,
      retry: 0,
      family: 4,
      remoteIp: '137.184.216.44',
      destination: `${gatewayUrl}${cleanPath}`,
      error: errorMsg
    });

    throw gatewayFailErr;
  }
}

module.exports = {
  dispatchFincraRequest,
  FincraGatewayError
};
