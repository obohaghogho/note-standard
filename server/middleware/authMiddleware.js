const supabase = require("../config/database");

/**
 * Helper to fetch user with retry logic for Supabase Auth
 * Mitigates transient network/service availability issues
 */
const getUserWithRetry = async (token, maxAttempts = 4) => {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.auth.getUser(token);

      // Return immediately for valid auth responses (success or auth errors like "Invalid token")
      // Only retry on service-level failures (status 500 or status 0 = network failure)
      if (!error) {
        return { data, error };
      }

      // Auth-level errors (401, 403, invalid token) are not retryable
      if (error.status && error.status !== 500 && error.status !== 0) {
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

    // Wait before next attempt (exponential backoff: 800ms, 1600ms, 3200ms)
    if (attempt < maxAttempts) {
      const delay = Math.pow(2, attempt - 1) * 800;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  return {
    data: { user: null },
    error: lastError || new Error("Auth service unavailable"),
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
      console.error("[Auth] Supabase error:", error);
      // Differentiate between invalid token and service failure
      if (error.status === 401 || error.message?.includes("invalid")) {
        return res.status(401).json({ error: "Invalid token" });
      }
      // Network/service failure — return 503 (retryable) not 500
      return res.status(503).json({
        error: "Auth service temporarily unavailable. Please retry.",
      });
    }

    if (!data?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = data.user;

    // Populate user profile for downstream use (plan, role, etc.)
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, status, plan, email, username")
      .eq("id", data.user.id)
      .single();

    if (profile) {
      req.userProfile = profile;
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
