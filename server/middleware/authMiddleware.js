const supabase = require("../config/database");

/**
 * Helper to fetch user with retry logic for Supabase Auth
 * Mitigates transient network/service availability issues
 */
const getUserWithRetry = async (token, maxAttempts = 3) => {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const { data, error } = await supabase.auth.getUser(token);

      // If we got a response (even if it's "Invalid token"), return it
      // We only retry on actual exceptions/service failures
      if (!error || error.status !== 500) {
        return { data, error };
      }

      lastError = error;
    } catch (err) {
      lastError = err;
    }

    // Wait before next attempt (exponential backoff: 500ms, 1000ms...)
    if (attempt < maxAttempts) {
      const delay = Math.pow(2, attempt - 1) * 500;
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
      return res.status(500).json({ error: "Auth service unavailable" });
    }

    if (!data?.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    req.user = data.user;
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
