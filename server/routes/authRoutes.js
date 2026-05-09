const express = require("express");
const router = express.Router();
const supabase = require("../config/database");
const { authLimiter, emailLimiter } = require("../middleware/rateLimiter");

const { register, login, verifyOtp, verifyEmail, resendOtp, forgotPassword } = require(
  "../controllers/authController",
);
const cors = require("cors");
const { validateRegistration } = require("../middleware/authValidator");

// Custom Signup Flow - Pre-registration checks
router.post("/register", authLimiter, validateRegistration, register);
router.post("/login", authLimiter, login);
router.post("/change-password", authLimiter, require("../middleware/authMiddleware").requireAuth, require("../controllers/authController").changePassword);
// Allow any origin for forgot password to prevent silent CORS preflight failures on custom domains
router.post("/forgot-password", cors(), emailLimiter, forgotPassword);

// Apply rate limiting to critical paths
router.use("/accept-terms", authLimiter);

router.post("/sync-profile", (req, res) => {
  // Logic to sync user profile if needed
  res.json({ message: "Profile sync endpoint" });
});

// Accept terms endpoint for post-OAuth signup
router.post("/accept-terms", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];

    // Verify the user's JWT token
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      token,
    );

    if (authError || !user) {
      return res.status(401).json({ error: "Invalid authentication token" });
    }

    // Update the user's profile with terms acceptance timestamp
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ terms_accepted_at: new Date().toISOString() })
      .eq("id", user.id);

    if (updateError) {
      console.error("Error updating terms acceptance:", updateError);
      return res.status(500).json({
        error: "Failed to update terms acceptance",
      });
    }

    res.json({
      success: true,
      message: "Terms accepted successfully",
      terms_accepted_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error("Error updating terms acceptance:", err);
    return res.status(500).json({
      error: "Failed to update terms acceptance",
    });
  }
});

// Export User Data (GDPR Compliance)
router.post("/export", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      token,
    );

    if (authError || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    // Fetch all user data in parallel
    const [profileRes, notesRes, subRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("notes").select("*").eq("owner_id", user.id),
      supabase.from("subscriptions").select("*").eq("user_id", user.id)
        .single(),
    ]);

    const exportData = {
      account: {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
      },
      profile: profileRes.data || {},
      subscription: subRes.data || {},
      notes: notesRes.data || [],
      exported_at: new Date().toISOString(),
    };

    res.json(exportData);
  } catch (err) {
    console.error("Export error:", err);
    res.status(500).json({ error: "Failed to export data" });
  }
});

// Delete Account (Right to be Forgotten)
router.delete("/delete-account", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const token = authHeader.split(" ")[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      token,
    );

    if (authError || !user) {
      return res.status(401).json({ error: "Invalid token" });
    }

    console.log(`[Auth] Deleting account for user: ${user.id}`);

    // Delete application data first
    // Note: If database has ON DELETE CASCADE on foreign keys,
    // we only need to delete the profile. But for safety:
    await Promise.all([
      supabase.from("notes").delete().eq("owner_id", user.id),
      supabase.from("subscriptions").delete().eq("user_id", user.id),
      supabase.from("ads").delete().eq("user_id", user.id),
      supabase.from("profiles").delete().eq("id", user.id),
    ]);

    // Finally delete from Supabase Auth
    // Use service role if available or admin API
    const { error: deleteError } = await supabase.auth.admin.deleteUser(
      user.id,
    );

    if (deleteError) {
      console.error("Supabase Auth delete error:", deleteError);
      return res.status(500).json({ error: "Failed to delete auth identity" });
    }

    res.json({ success: true, message: "Account deleted successfully" });
  } catch (err) {
    console.error("Delete account error:", err);
    res.status(500).json({ error: "Failed to delete account" });
  }
});

module.exports = router;
