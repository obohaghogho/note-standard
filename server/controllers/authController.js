const bcrypt = require("bcryptjs");
const axios = require("axios");
const supabase = require("../config/supabase");

/**
 * Handles the initial registration request
 * Creates user in Supabase Auth immediately but unverified
 */
const register = async (req, res) => {
  try {
    const {
      fullName,
      username,
      email,
      password,
      captchaToken,
      referrerId,
    } = req.body;

    // 1. reCAPTCHA check
    if (
      process.env.RECAPTCHA_SECRET_KEY && process.env.NODE_ENV === "production"
    ) {
      if (!captchaToken) {
        return res.status(400).json({ error: "Please verify you are human." });
      }
      const verify = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify?secret=${process.env.RECAPTCHA_SECRET_KEY}&response=${captchaToken}`,
      );
      if (!verify.data.success) {
        console.warn(`[AUTH-WARN] reCAPTCHA failed for ${email}`);
        return res.status(400).json({ error: "reCAPTCHA failed." });
      }
    }

    // 2. Duplication check
    const { data: existingUser } = await supabase
      .from("profiles")
      .select("id, email, username, is_verified")
      .or(`email.eq.${email},username.eq.${username}`)
      .maybeSingle();

    if (existingUser) {
      let field = "Account";
      if (existingUser.email === email) field = "Email";
      else if (existingUser.username === username) field = "Username";
      return res.status(409).json({ error: `${field} is already in use.` });
    }

    // 3. The frontend will handle the actual signUp call for better integration.
    // However, we pre-create the profile to ensure consistency.
    // Note: In a production app, you might use a Supabase Trigger for this.

    // We return success to let the frontend proceed with supabase.auth.signUp
    res.status(200).json({
      success: true,
      message: "Ready for registration.",
    });
  } catch (err) {
    console.error("[Register Error]:", err.message);
    res.status(500).json({ error: "Signup failed. Please try again." });
  }
};

const verifyOtp = async (req, res) => {
  res.status(410).json({
    error:
      "This endpoint is deprecated. Please use native Supabase email confirmation.",
  });
};

const resendOtp = async (req, res) => {
  res.status(410).json({
    error:
      "This endpoint is deprecated. Please use native Supabase email confirmation.",
  });
};

const verifyEmail = (req, res) => {
  res.status(410).json({
    error:
      "This endpoint is deprecated. Please use native Supabase email confirmation.",
  });
};

/**
 * Standard forgot password - using Supabase direct email delivery
 */
const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    // Check if user exists
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, email")
      .eq("email", email)
      .maybeSingle();

    // Always return success to prevent email enumeration attacks
    if (!profile) {
      console.log(
        `[AUTH-INFO] Password reset requested for non-existent email: ${email}`,
      );
      return res.json({
        success: true,
        message: "If an account exists, a reset email has been sent.",
      });
    }

    const clientUrl = process.env.CLIENT_URL || "https://notestandard.com";
    const redirectTo = `${clientUrl}/reset-password`;

    // DEBUG: Log the redirect URL to verify it's correct on Render
    console.log(
      `[AUTH-DEBUG] CLIENT_URL=${process.env.CLIENT_URL}, redirectTo=${redirectTo}`,
    );

    // Leverage Supabase's built in email service to send the reset link
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });

    if (error) {
      console.error(
        `[AUTH-ERROR] Failed to send reset email: ${error.message}`,
      );
      throw error;
    }

    console.log(
      `[AUTH-INFO] Password reset email sent via Supabase to ${email}`,
    );
    res.json({
      success: true,
      message: "If an account exists, a reset email has been sent.",
    });
  } catch (err) {
    console.error("[ForgotPassword Error]:", err.message);
    res.status(500).json({
      error: "Failed to process password reset request.",
    });
  }
};

module.exports = {
  register,
  verifyEmail,
  verifyOtp,
  resendOtp,
  forgotPassword,
};
