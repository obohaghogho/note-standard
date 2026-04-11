const bcrypt = require("bcryptjs");
const axios = require("axios");
const supabase = require("../config/database");
const env = require("../config/env");

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
      env.RECAPTCHA_SECRET_KEY && env.NODE_ENV === "production"
    ) {
      if (!captchaToken) {
        return res.status(400).json({ error: "Please verify you are human." });
      }
      const verify = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify?secret=${env.RECAPTCHA_SECRET_KEY}&response=${captchaToken}`,
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

    // 3. Create the user in Supabase Auth via Admin API
    // This bypasses the broken built-in SMTP and auto-confirms the user.
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        username: username,
        referrer_id: referrerId,
        is_verified: true
      }
    });

    if (authError) {
      console.error("[AUTH-ERROR] Admin creation failed:", authError.message);
      return res.status(400).json({ error: authError.message });
    }

    // Note: The database trigger 'handle_new_user' will automatically create
    // the profile and wallets when the record hits the auth.users table.

    res.status(200).json({
      success: true,
      message: "Registration successful! You can now log in.",
      user: {
        id: authData.user.id,
        email: authData.user.email
      }
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

    const clientUrl = env.CLIENT_URL || "https://notestandard.com";
    const redirectTo = `${clientUrl}/reset-password`;

    // DEBUG: Log the redirect URL to verify it's correct on Render
    console.log(
      `[AUTH-DEBUG] CLIENT_URL=${env.CLIENT_URL}, redirectTo=${redirectTo}`,
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
