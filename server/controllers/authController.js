const bcrypt = require("bcryptjs");
const axios = require("axios");
const supabase = require("../config/database");
const env = require("../config/env");
const mailService = require("../services/mailService");

/**
 * Handles the initial registration request
 * Creates user in Supabase Auth immediately but unverified
 */
const register = async (req, res) => {
  try {
    let {
      fullName,
      full_name,
      username,
      email,
      password,
      captchaToken,
      referrerId,
    } = req.body;

    // Support both naming conventions
    fullName = fullName || full_name;
    // Generate username from email if not provided (mobile doesn't send it)
    if (!username && email) {
      username = email.split('@')[0] + Math.floor(Math.random() * 1000);
    }

    // 1. reCAPTCHA check (Bypass for mobile apps which don't send origin or send specific app headers)
    const isMobile = !req.headers.origin || req.headers['x-client-info']?.includes('mobile');
    
    if (
      env.RECAPTCHA_SECRET_KEY && env.NODE_ENV === "production" && !isMobile
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

    // 4. Send Welcome Email (Confirmation)
    // We send this as a background task to not block the response
    mailService.sendWelcomeEmail(email, fullName).catch(err => {
      console.error("[AUTH-WARN] Failed to send welcome email:", err.message);
    });

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

/**
 * Handles login request from mobile/web
 */
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      console.error("[AUTH-ERROR] Login failed:", error.message);
      return res.status(401).json({ error: error.message });
    }

    res.status(200).json({
      success: true,
      token: data.session.access_token,
      user: {
        id: data.user.id,
        email: data.user.email,
        full_name: data.user.user_metadata?.full_name,
        avatar_url: data.user.user_metadata?.avatar_url,
      }
    });
  } catch (err) {
    console.error("[Login Error]:", err.message);
    res.status(500).json({ error: "Login failed. Please try again." });
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

    const clientUrl = env.CLIENT_URL || req.headers.origin || "https://notestandard.com";
    const redirectTo = `${clientUrl.replace(/\/$/, "")}/reset-password`;

    // DEBUG: Log the redirect URL to verify it's correct on Render
    console.log(
      `[AUTH-DEBUG] CLIENT_URL=${env.CLIENT_URL}, redirectTo=${redirectTo}`,
    );

    // Generate a secure reset link via Supabase Admin API
    // This bypasses the built-in SMTP and gives us the link to send via our own mail service
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: { redirectTo }
    });

    if (linkError) {
      console.error(
        `[AUTH-ERROR] Failed to generate reset link: ${linkError.message}`,
      );
      throw linkError;
    }

    const resetLink = linkData.properties.action_link;
    console.log(`[AUTH-INFO] Generated reset link for ${email}`);

    // Send the link via our custom mail service
    const emailSent = await mailService.sendPasswordResetEmail(email, resetLink);

    if (!emailSent) {
      console.error(`[AUTH-ERROR] Failed to send reset email to ${email}`);
      // We still return success to the user for security, but log the error
    }

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
  login,
  verifyEmail,
  verifyOtp,
  resendOtp,
  forgotPassword,
};
