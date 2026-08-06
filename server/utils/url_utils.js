const env = require("../config/env");

/**
 * Generates a consistent, environment-aware callback URL for payment providers.
 * Sanitizes URLs to meet provider-specific requirements (e.g. Fincra strictness).
 * 
 * @param {string} path - The relative path for the callback (e.g., "/dashboard/billing")
 * @param {Object} params - Query parameters to append
 * @param {string} provider - (Optional) Provider name to handle specific quirks
 * @returns {string} The fully qualified, sanitized URL
 */
const getCallbackUrl = (path, params = {}, provider = null) => {
  const baseUrl = env.CLIENT_URL || "https://notestandard.com";
  
  // 1. Build Base URL with path
  let url = new URL(path, baseUrl);
  
  // 2. Append Search Params
  Object.keys(params).forEach(key => {
    if (params[key] !== undefined && params[key] !== null) {
      url.searchParams.append(key, params[key]);
    }
  });

  let finalizedUrl = url.toString();

  // 3. Provider Specific Sanitization
  if (provider === "fincra") {
    /**
     * Fincra Quirks:
     * - Rejects 'localhost' even in sandbox (throws "redirectUrl must be a URL address").
     * - Requires HTTPS in production.
     */
    if (env.NODE_ENV === "production" && finalizedUrl.startsWith("http://")) {
        finalizedUrl = finalizedUrl.replace("http://", "https://");
    }
    
    // In dev, if using localhost, Fincra API rejects it. 
    // We use a wildcard DNS (nip.io) to trick Fincra's strict frontend URL validation
    // while still correctly routing you back to your local computer.
    if (finalizedUrl.includes("localhost") || finalizedUrl.includes("127.0.0.1")) {
        finalizedUrl = finalizedUrl.replace("localhost", "127.0.0.1.nip.io");
        finalizedUrl = finalizedUrl.replace("127.0.0.1:", "127.0.0.1.nip.io:");
    }
  }

  return finalizedUrl;
};

/**
 * Generates a valid absolute HTTPS URI for NOWPayments IPN callbacks.
 * Enforces NOWPayments requirements:
 * - Must be a valid absolute URI (http:// or https://)
 * - Uses NOWPAYMENTS_WEBHOOK_URL if provided
 * - Falls back to SERVER_URL / BACKEND_URL / RENDER_EXTERNAL_URL / production domain
 */
const getNowPaymentsIpnUrl = (customUrl = null) => {
  if (customUrl && typeof customUrl === "string" && customUrl.startsWith("http")) {
    return customUrl;
  }
  if (process.env.NOWPAYMENTS_WEBHOOK_URL && process.env.NOWPAYMENTS_WEBHOOK_URL.startsWith("http")) {
    return process.env.NOWPAYMENTS_WEBHOOK_URL;
  }

  const rawBase = process.env.SERVER_URL || 
                  process.env.BACKEND_URL || 
                  process.env.RENDER_EXTERNAL_URL || 
                  env.SERVER_URL || 
                  "https://note-standard-api.onrender.com";

  let cleanBase = String(rawBase || "").trim().replace(/\/$/, "");
  if (!cleanBase.startsWith("http")) {
    cleanBase = `https://${cleanBase}`;
  }
  
  if (cleanBase.includes("localhost") || cleanBase.includes("127.0.0.1") || cleanBase.includes("undefined")) {
    cleanBase = "https://note-standard-api.onrender.com";
  }

  return `${cleanBase}/webhooks/nowpayments`;
};

module.exports = { getCallbackUrl, getNowPaymentsIpnUrl };
