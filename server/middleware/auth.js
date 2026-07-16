const path = require("path");
const supabase = require(path.join(__dirname, "..", "config", "supabase"));

const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error("[Auth] Error:", err.message);
    next(err);
  }
};

// Admin middleware - requires admin or support role
const requireAdmin = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

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
    next(err);
  }
};

module.exports = { requireAuth, requireAdmin };
