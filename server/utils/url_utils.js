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
     * - Rejects 'localhost' even in sandbox.
     * - Requires HTTPS in production.
     */
    if (env.NODE_ENV === "production" && finalizedUrl.startsWith("http://")) {
        finalizedUrl = finalizedUrl.replace("http://", "https://");
    }
    
    // In dev, if using localhost, we might need a tunnel or IP.
    // However, for the 'audit' we want to discourage localhost-specific hacks in service code.
    // We'll trust env.CLIENT_URL to be set correctly for the environment.
  }

  return finalizedUrl;
};

module.exports = { getCallbackUrl };
