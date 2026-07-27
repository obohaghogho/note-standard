/**
 * Production Fincra Static IP Gateway Service
 * ───────────────────────────────────────────
 * Standalone Node.js proxy server providing a fixed egress IP (137.184.216.44)
 * for all outbound NoteStandard → Fincra API traffic.
 */

const express = require('express');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

// ── Environment & Config ───────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT || '4000', 10);
const NODE_ENV = (process.env.NODE_ENV || 'production').toLowerCase();
const FINCRA_ENV = (process.env.FINCRA_ENV || 'sandbox').toLowerCase();
const LOG_DIR = process.env.LOG_DIR || (fs.existsSync('/var/log/fincra-gateway') ? '/var/log/fincra-gateway' : path.join(__dirname, 'logs'));

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  } catch (err) {
    console.error(`[Gateway] Warning: Could not create log directory ${LOG_DIR}:`, err.message);
  }
}

// Target URL resolution
let DEFAULT_FINCRA_TARGET = 'https://sandboxapi.fincra.com';
if (FINCRA_ENV === 'production' || FINCRA_ENV === 'live') {
  DEFAULT_FINCRA_TARGET = 'https://api.fincra.com';
}
const FINCRA_TARGET_URL = (process.env.FINCRA_TARGET_URL || DEFAULT_FINCRA_TARGET).replace(/\/+$/, '');

// Path allowlist
const ALLOWED_PATH_PREFIXES = [
  '/checkout',
  '/payments',
  '/collections',
  '/disbursements',
  '/transfers',
  '/virtual-accounts',
  '/profile',
  '/customers',
  '/businesses',
  '/core',
  '/wallets',
  '/quotes',
  '/conversions'
];

// ── HTTPS Connection Pooling Agent ────────────────────────────────────────
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 50,
  maxFreeSockets: 10,
  timeout: 30000,
  freeSocketTimeout: 15000,
  rejectUnauthorized: true, // Strict TLS verification
});

// ── Metrics Tracking ──────────────────────────────────────────────────────
const metrics = {
  totalRequests: 0,
  successRequests: 0,
  failedRequests: 0,
  rateLimitedRequests: 0,
  totalLatencyMs: 0,
  startTime: Date.now(),
};

// ── Secret Management Service ─────────────────────────────────────────────
class SecretService {
  static getValidKeys() {
    const keys = [];
    const current = (process.env.GATEWAY_KEY_CURRENT || process.env.GATEWAY_KEY || '').trim();
    const previous = (process.env.GATEWAY_KEY_PREVIOUS || '').trim();
    if (current) keys.push(current);
    if (previous) keys.push(previous);
    return keys;
  }

  static validateKey(key) {
    if (!key) return false;
    const validKeys = this.getValidKeys();
    if (validKeys.length === 0) {
      console.error('[Gateway] CRITICAL: No GATEWAY_KEY configured in environment!');
      return false;
    }
    return validKeys.some((validKey) => {
      try {
        return crypto.timingSafeEqual(Buffer.from(key), Buffer.from(validKey));
      } catch {
        return false;
      }
    });
  }

  static validateHmacSignature(rawBody, timestampStr, signature, providedKey) {
    if (!timestampStr || !signature) return { valid: false, reason: 'Missing timestamp or signature headers' };
    
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return { valid: false, reason: 'Invalid timestamp format' };

    // 5-minute (300,000 ms) clock drift allowance
    const now = Date.now();
    if (Math.abs(now - timestamp) > 300000) {
      return { valid: false, reason: 'Timestamp outside 5-minute clock drift window' };
    }

    const payload = `${timestamp}${rawBody}`;
    const keysToTest = providedKey ? [providedKey] : this.getValidKeys();

    for (const key of keysToTest) {
      const expectedSignature = crypto.createHmac('sha256', key).update(payload).digest('hex');
      try {
        if (crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
          return { valid: true };
        }
      } catch {
        // Continue to next key if timingSafeEqual fails due to length mismatch
      }
    }

    return { valid: false, reason: 'HMAC signature mismatch' };
  }
}

// ── Circuit Breaker Service ──────────────────────────────────────────────
class CircuitBreakerService {
  constructor(failureThreshold = 5, cooldownMs = 30000) {
    this.failureThreshold = failureThreshold;
    this.cooldownMs = cooldownMs;
    this.consecutiveFailures = 0;
    this.state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    this.lastStateChange = Date.now();
  }

  canExecute() {
    if (this.state === 'CLOSED') return true;
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastStateChange >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
        this.lastStateChange = Date.now();
        return true;
      }
      return false;
    }
    return true; // HALF_OPEN allows trial execution
  }

  recordSuccess() {
    this.consecutiveFailures = 0;
    if (this.state !== 'CLOSED') {
      this.state = 'CLOSED';
      this.lastStateChange = Date.now();
    }
  }

  recordFailure() {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.lastStateChange = Date.now();
    }
  }

  getState() {
    return {
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      lastStateChange: new Date(this.lastStateChange).toISOString(),
    };
  }
}

const circuitBreaker = new CircuitBreakerService();

// ── Logger Utility ────────────────────────────────────────────────────────
const accessLogStream = fs.createWriteStream(path.join(LOG_DIR, 'access.log'), { flags: 'a' });
const errorLogStream = fs.createWriteStream(path.join(LOG_DIR, 'error.log'), { flags: 'a' });

function logStructured(level, message, details = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...details,
  };
  
  const formatted = JSON.stringify(entry) + '\n';
  if (level === 'error') {
    errorLogStream.write(formatted);
  } else {
    accessLogStream.write(formatted);
  }

  if (NODE_ENV === 'development') {
    console.log(`[${entry.timestamp}] [${level.toUpperCase()}] ${message}`, details);
  }
}

// ── Express Application ───────────────────────────────────────────────────
const app = express();

app.use(helmet());
app.use(compression());

// Capture raw body for HMAC verification
app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    req.rawBody = buf.toString('utf8');
  }
}));

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    metrics.rateLimitedRequests += 1;
    logStructured('warn', 'Rate limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({
      success: false,
      error: 'Too Many Requests',
      message: 'Rate limit exceeded. Please try again later.'
    });
  }
});

app.use(limiter);

// Correlation ID & Request Timing Middleware
app.use((req, res, next) => {
  req.startTime = Date.now();
  req.requestId = req.headers['x-request-id'] || req.headers['x-correlation-id'] || uuidv4();
  res.setHeader('X-Request-ID', req.requestId);
  next();
});

// Authentication Middleware
function authenticateRequest(req, res, next) {
  const apiKey = req.headers['x-gateway-key'];

  if (!apiKey || !SecretService.validateKey(apiKey)) {
    logStructured('warn', 'Unauthorized gateway access attempt', {
      requestId: req.requestId,
      ip: req.ip,
      path: req.path
    });
    return res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid or missing X-Gateway-Key header.'
    });
  }

  // Optional HMAC Verification if headers provided
  const timestamp = req.headers['x-timestamp'];
  const signature = req.headers['x-signature'];

  if (timestamp || signature) {
    const hmacResult = SecretService.validateHmacSignature(req.rawBody || '', timestamp, signature, apiKey);
    if (!hmacResult.valid) {
      logStructured('warn', 'HMAC signature failure', {
        requestId: req.requestId,
        reason: hmacResult.reason
      });
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
        message: `HMAC authentication failed: ${hmacResult.reason}`
      });
    }
  }

  next();
}

// ── GET /health ────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  const startProbe = Date.now();
  let fincraReachable = false;
  let probeLatencyMs = 0;

  try {
    const probeRes = await axios.get(`${FINCRA_TARGET_URL}/core/businesses/me`, {
      headers: { 'Accept': 'application/json' },
      timeout: 3000,
      httpsAgent,
      validateStatus: () => true // Treat any status (e.g. 401) as network reachability confirmation
    });
    fincraReachable = probeRes.status < 500 || probeRes.status === 401;
    probeLatencyMs = Date.now() - startProbe;
  } catch (err) {
    fincraReachable = false;
    probeLatencyMs = Date.now() - startProbe;
  }

  const memoryUsage = process.memoryUsage();
  const overallStatus = fincraReachable ? 'ok' : 'degraded';

  res.status(200).json({
    status: overallStatus,
    gateway: 'healthy',
    fincraReachable,
    targetUrl: FINCRA_TARGET_URL,
    circuit: circuitBreaker.getState(),
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    nodeVersion: process.version,
    memory: {
      rssMb: (memoryUsage.rss / 1024 / 1024).toFixed(2),
      heapUsedMb: (memoryUsage.heapUsed / 1024 / 1024).toFixed(2)
    },
    probeLatencyMs
  });
});

// ── GET /metrics (Protected) ──────────────────────────────────────────────
app.get('/metrics', authenticateRequest, (req, res) => {
  const avgLatencyMs = metrics.totalRequests > 0
    ? Math.round(metrics.totalLatencyMs / metrics.totalRequests)
    : 0;

  res.status(200).json({
    totalRequests: metrics.totalRequests,
    successRequests: metrics.successRequests,
    failedRequests: metrics.failedRequests,
    rateLimitedRequests: metrics.rateLimitedRequests,
    avgLatencyMs,
    circuitState: circuitBreaker.getState(),
    uptimeSeconds: Math.floor((Date.now() - metrics.startTime) / 1000)
  });
});

// ── POST /proxy ────────────────────────────────────────────────────────────
app.post('/proxy', authenticateRequest, async (req, res) => {
  metrics.totalRequests += 1;

  if (!circuitBreaker.canExecute()) {
    metrics.failedRequests += 1;
    logStructured('error', 'Circuit breaker OPEN: Request rejected', {
      requestId: req.requestId,
      path: req.body?.path
    });
    return res.status(503).json({
      success: false,
      error: 'Service Unavailable',
      message: 'Fincra upstream service circuit is currently OPEN due to consecutive failures. Please try again later.',
      circuit: circuitBreaker.getState()
    });
  }

  const { method, path: reqPath, headers: reqHeaders = {}, body: reqBody } = req.body || {};

  // 1. Input Validation
  if (!method || !reqPath) {
    metrics.failedRequests += 1;
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Proxy body must contain non-empty "method" and "path" fields.'
    });
  }

  const normMethod = String(method).toUpperCase();
  const validMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
  if (!validMethods.includes(normMethod)) {
    metrics.failedRequests += 1;
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: `Invalid HTTP method "${method}". Allowed methods: ${validMethods.join(', ')}.`
    });
  }

  // 2. Path Whitelisting Validation
  const cleanPath = String(reqPath).trim();
  if (!cleanPath.startsWith('/') || cleanPath.includes('..') || cleanPath.includes('://')) {
    metrics.failedRequests += 1;
    logStructured('warn', 'Invalid or malicious proxy path attempt', {
      requestId: req.requestId,
      path: cleanPath
    });
    return res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Invalid path format. Path must start with "/" and cannot contain relative path traversals.'
    });
  }

  const isAllowedPath = ALLOWED_PATH_PREFIXES.some((prefix) => cleanPath.startsWith(prefix));
  if (!isAllowedPath) {
    metrics.failedRequests += 1;
    logStructured('warn', 'Disallowed proxy path request', {
      requestId: req.requestId,
      path: cleanPath
    });
    return res.status(400).json({
      success: false,
      error: 'Forbidden Path',
      message: `Path "${cleanPath}" is not on the allowed Fincra endpoint whitelist.`
    });
  }

  // 3. Prepare Header Forwarding
  const forwardedHeaders = {};
  const allowedHeaderKeys = [
    'authorization',
    'api-key',
    'apikey',
    'x-pub-key',
    'x-business-id',
    'content-type',
    'accept',
    'idempotency-key'
  ];

  if (typeof reqHeaders === 'object' && reqHeaders !== null) {
    for (const [key, value] of Object.entries(reqHeaders)) {
      const lowerKey = key.toLowerCase();
      if (allowedHeaderKeys.includes(lowerKey)) {
        forwardedHeaders[lowerKey] = value;
      }
    }
  }

  // Always attach correlation ID to upstream call
  forwardedHeaders['x-request-id'] = req.requestId;

  const targetUrl = `${FINCRA_TARGET_URL}${cleanPath}`;
  const isIdempotent = normMethod === 'GET' || Boolean(reqHeaders['idempotency-key'] || reqHeaders['Idempotency-Key']);

  // 4. Axios Dispatch Handler with Retry
  let attempts = 0;
  const maxAttempts = isIdempotent ? 2 : 1;
  let lastError = null;
  let upstreamResponse = null;

  while (attempts < maxAttempts) {
    attempts += 1;
    try {
      upstreamResponse = await axios({
        method: normMethod,
        url: targetUrl,
        headers: forwardedHeaders,
        data: reqBody,
        timeout: 30000,
        httpsAgent,
        validateStatus: () => true // Allow handling of all status codes
      });
      break; // Request succeeded (got HTTP response from upstream)
    } catch (err) {
      lastError = err;
      if (attempts < maxAttempts) {
        logStructured('warn', `Transient error forwarding to Fincra. Retrying attempt ${attempts}...`, {
          requestId: req.requestId,
          error: err.message
        });
        await new Promise((r) => setTimeout(r, 500));
      }
    }
  }

  const durationMs = Date.now() - req.startTime;
  metrics.totalLatencyMs += durationMs;

  if (upstreamResponse) {
    const isSuccess = upstreamResponse.status < 500;
    if (isSuccess) {
      circuitBreaker.recordSuccess();
      metrics.successRequests += 1;
    } else {
      circuitBreaker.recordFailure();
      metrics.failedRequests += 1;
    }

    logStructured('info', `Forwarded ${normMethod} ${cleanPath} → HTTP ${upstreamResponse.status}`, {
      requestId: req.requestId,
      status: upstreamResponse.status,
      latencyMs: durationMs,
      attempts
    });

    return res.status(upstreamResponse.status).json({
      status: upstreamResponse.status,
      data: upstreamResponse.data,
      headers: {
        'content-type': upstreamResponse.headers['content-type'],
        'x-request-id': req.requestId
      }
    });
  } else {
    // Upstream Network Failure
    circuitBreaker.recordFailure();
    metrics.failedRequests += 1;

    logStructured('error', `Failed to reach Fincra upstream after ${attempts} attempts`, {
      requestId: req.requestId,
      error: lastError?.message,
      latencyMs: durationMs
    });

    return res.status(502).json({
      success: false,
      error: 'Bad Gateway',
      message: 'Failed to establish connection with Fincra upstream API.',
      details: lastError?.message,
      requestId: req.requestId
    });
  }
});

// ── 404 Handler ────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Not Found',
    message: `Endpoint ${req.method} ${req.path} does not exist.`
  });
});

// ── Server Startup & Graceful Shutdown ─────────────────────────────────────
const server = app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Fincra Gateway Listening on Port ${PORT}`);
  console.log(`   Environment: ${NODE_ENV.toUpperCase()}`);
  console.log(`   Fincra Target: ${FINCRA_TARGET_URL}`);
  console.log(`   Log Directory: ${LOG_DIR}`);
  console.log(`=======================================================`);
});

function gracefulShutdown(signal) {
  console.log(`\n[Gateway] Received ${signal}. Initiating graceful shutdown...`);
  server.close(() => {
    console.log('[Gateway] Closed active HTTP connections.');
    accessLogStream.end();
    errorLogStream.end();
    process.exit(0);
  });

  // Force exit if not closed within 10s
  setTimeout(() => {
    console.error('[Gateway] Force shutting down after 10s timeout.');
    process.exit(1);
  }, 10000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

module.exports = app;
