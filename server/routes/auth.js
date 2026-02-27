const express = require("express");
const router = express.Router();
const supabase = require("../config/supabase");
const { authLimiter } = require("../middleware/rateLimiter");

const { register, verifyOtp, verifyEmail, resendOtp, forgotPassword } = require(
  "../controllers/authController",
);
const cors = require("cors");
const { validateRegistration } = require("../middleware/authValidator");

// Custom Signup Flow - Pre-registration checks
router.post("/register", authLimiter, validateRegistration, register);
// Allow any origin for forgot password to prevent silent CORS preflight failures on custom domains
router.post("/forgot-password", cors(), authLimiter, forgotPassword);

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
    console.error("Error in accept-terms endpoint:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
