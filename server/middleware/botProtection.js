const logger = require("../utils/logger");

/**
 * Bot Defense & Anti-Automated Abuse Middleware
 * 
 * Protects application endpoints against:
 * 1. Malicious automated bots, headless scanners, and vulnerability probes.
 * 2. Malicious payload patterns (SQL injection, XSS script injection, path traversal).
 * 3. Secret leaks and system header fingerprinting.
 */

// Suspicious bot & vulnerability scanner user-agent patterns
const BLOCKED_BOT_PATTERNS = [
  /sqlmap/i,
  /nikto/i,
  /nmap/i,
  /masscan/i,
  /dirbuster/i,
  /zgrab/i,
  /httpx/i,
  /zmap/i,
  /w3af/i,
  /acunetix/i,
  /havij/i,
  /appscan/i,
  /metasploit/i,
  /gobuster/i,
  /wfuzz/i,
  /hydra/i,
  /medusa/i,
  /nessus/i,
  /openvas/i,
  /python-requests\/0/i, // Obsolete automated bot scripts
];

// Malicious payload patterns (SQLi, XSS, Path Traversal)
const MALICIOUS_PAYLOAD_PATTERNS = [
  /<script\b[^>]*>[\s\S]*?<\/script>/gi, // XSS script tags
  /javascript\s*:/gi,                   // inline JS protocol
  /union\s+all\s+select/gi,             // SQL Injection UNION
  /union\s+select/gi,                   // SQL Injection UNION
  /exec\s*\(\s*s*t*r*i*n*g/gi,          // SQL exec
  /;\s*drop\s+table/gi,                 // DROP TABLE
  /;\s*truncate\s+table/gi,             // TRUNCATE TABLE
  /(\.\.[\/\\]){3,}/g,                  // Deep Path Traversal
];

function botProtection(req, res, next) {
  // Disable X-Powered-By header to prevent backend framework fingerprinting
  res.removeHeader("X-Powered-By");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");

  // Skip checks for webhooks (which are sent by automated provider systems)
  if (req.originalUrl && (req.originalUrl.includes("/webhook") || req.originalUrl.includes("/webhooks"))) {
    return next();
  }

  const userAgent = req.headers["user-agent"] || "";

  // 1. Detect and block known malicious bot/scanner user-agents
  const isBlockedBot = BLOCKED_BOT_PATTERNS.some((pattern) => pattern.test(userAgent));
  if (isBlockedBot) {
    logger.warn(`[BotProtection] Blocked automated scanner/bot request: ${req.method} ${req.originalUrl}`, {
      ip: req.ip,
      userAgent,
    });
    return res.status(403).json({
      error: "Access denied. Automated scanners and malicious bots are blocked for security.",
      code: "BOT_ACCESS_DENIED",
    });
  }

  // 2. Detect malicious payload injection in query parameters
  const queryString = req.url ? decodeURIComponent(req.url) : "";
  const isMaliciousPayload = MALICIOUS_PAYLOAD_PATTERNS.some((pattern) => pattern.test(queryString));

  if (isMaliciousPayload) {
    logger.warn(`[BotProtection] Blocked malicious payload attempt: ${req.method} ${req.originalUrl}`, {
      ip: req.ip,
      queryString,
    });
    return res.status(400).json({
      error: "Bad request. Suspicious request payload detected.",
      code: "MALICIOUS_PAYLOAD_BLOCKED",
    });
  }

  next();
}

module.exports = botProtection;
