const supabase = require("../config/database");

// Simple in-memory profile cache to reduce DB load
const profileCache = new Map(); // userId -> { profile, expiresAt }
const PROFILE_CACHE_TTL = 60000; // 60 seconds

/**
 * Helper to fetch user with retry logic for Supabase Auth
 * Mitigates transient network/service availability issues
 */
const getUserWithRetry = async (token, maxAttempts = 3) => {
  let lastError = null;

  // 1. Pre-validation: Catch malformed JS-error tokens from client
  if (!token || token === "undefined" || token === "null" || token.length < 10) {
    return { 
      data: { user: null }, 
      error: { status: 401, message: "Malformated or missing token" } 
    };
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.auth.getUser(token);

      // Return immediately for valid auth responses (success or auth errors like "Invalid token")
      // Only retry on service-level failures (status 500 or status 0 = network failure)
      if (!error) {
        return { data, error };
      }

      // 2. Identify definitively non-retryable errors
      const msg = error.message?.toLowerCase() || "";
      const isAuthError = 
        (error.status && error.status !== 500 && error.status !== 0) ||
        msg.includes("invalid") ||
        msg.includes("missing") ||
        msg.includes("expired") ||
        msg.includes("not found");

      if (isAuthError) {
        return { data, error };
      }

      // Service/network failure — retry
      lastError = error;
      console.warn(
        `[Auth] Attempt ${attempt}/${maxAttempts} failed (status=${error.status}): ${error.message}`,
      );
    } catch (err) {
      lastError = err;
      console.warn(
        `[Auth] Attempt ${attempt}/${maxAttempts} threw: ${err.message}`,
      );
    }

    // Wait before next attempt (exponential backoff: 500ms, 1000ms)
    if (attempt < maxAttempts) {
      const delay = Math.pow(2, attempt - 1) * 500;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return {
    data: { user: null },
    error: lastError || { status: 503, message: "Auth service unavailable" },
  };
};

const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const { data, error } = await getUserWithRetry(token);

    if (error) {
      console.error("[Auth] Supabase error details:", {
        status: error.status,
        message: error.message,
        name: error.name,
        code: error.code
      });
      // Differentiate between invalid token and service failure
      if (error.status === 401 || error.message?.includes("invalid")) {
        return res.status(401).json({ error: "Invalid token" });
      }
      // Network/service failure — return 503 (retryable) not 500
      return res.status(503).json({
        error: "Auth service temporarily unavailable. Please retry.",
        details: error.message
      });
    }

    if (!data?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = data.user;

    // Populate user profile for downstream use (plan, role, etc.) with caching
    const cached = profileCache.get(data.user.id);
    if (cached && cached.expiresAt > Date.now()) {
      req.userProfile = cached.profile;
    } else {
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role, status, plan_tier, email, username")
        .eq("id", data.user.id)
        .single();

      if (profile) {
        req.userProfile = profile;
        profileCache.set(data.user.id, {
          profile,
          expiresAt: Date.now() + PROFILE_CACHE_TTL
        });
      }
    }

    next();
  } catch (err) {
    console.error("[Auth] Fatal Error:", err.message);
    return res.status(500).json({ error: "Internal Auth Error" });
  }
};

// Admin middleware - requires admin or support role
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const { data, error } = await getUserWithRetry(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid token or Unauthorized" });
    }

    const user = data.user;

    // Check user role from profiles table
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role, status")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return res.status(403).json({ error: "Profile not found" });
    }

    if (profile.status === "suspended") {
      return res.status(403).json({ error: "Account suspended" });
    }

    if (!["admin", "support"].includes(profile.role)) {
      return res.status(403).json({ error: "Admin access required" });
    }

    req.user = user;
    req.userProfile = profile;
    next();
  } catch (err) {
    console.error("Admin auth error:", err);
    return res.status(500).json({ error: "Auth service failure" });
  }
};

module.exports = { requireAuth, requireAdmin };
