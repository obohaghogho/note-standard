const bcrypt = require("bcryptjs");
const axios = require("axios");
const supabase = require("../config/supabase");
const { sendVerificationEmail } = require("../services/mailService");

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

    // 2. Duplication check - Optimized select
    const { data: existingUser } = await supabase
      .from("profiles")
      .select("id, email, username, is_verified")
      .or(`email.eq.${email},username.eq.${username}`)
      .maybeSingle();

    if (existingUser) {
      if (!existingUser.is_verified) {
        console.log(`[AUTH-INFO] Resume verification attempt for ${email}`);
        return res.status(409).json({
          error:
            "This account exists but is not yet verified. Please sign in to complete verification.",
          code: "UNVERIFIED_ACCOUNT",
        });
      }
      let field = "Account";
      if (existingUser.email === email) field = "Email";
      else if (existingUser.username === username) field = "Username";
      return res.status(409).json({ error: `${field} is already in use.` });
    }

    // 3. Create Supabase Auth User Immediately (Unverified)
    const { data: authData, error: authError } = await supabase.auth.admin
      .createUser({
        email,
        password,
        email_confirm: false, // We handle our own email verification
        user_metadata: {
          full_name: fullName,
          username,
          is_verified: false,
          referrer_id: referrerId || null,
        },
      });

    if (authError) {
      console.error(
        `[AUTH-ERROR] Supabase User Creation Failed: ${authError.message}`,
      );
      throw authError;
    }

    // 4. Create Profile
    const { error: profileError } = await supabase.from("profiles").insert([{
      id: authData.user.id,
      email,
      username,
      full_name: fullName,
      referrer_id: referrerId || null,
      is_verified: false,
    }]);

    if (profileError) {
      console.error(
        `[AUTH-ERROR] Profile Sync Failed: ${profileError.message}`,
      );
    }

    // 5. Generate code for custom verification
    const emailOtp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiry = new Date(Date.now() + 15 * 60 * 1000);

    // 6. Store in Pending Table
    const { error: insertError } = await supabase
      .from("pending_verifications")
      .upsert([{
        full_name: fullName,
        username,
        email,
        password_hash: "PROTECTED",
        otp_code: "DEPRECATED",
        email_otp: emailOtp,
        otp_expires_at: expiry.toISOString(),
        referrer_id: referrerId || null,
        attempts: 0,
        last_otp_sent_at: new Date().toISOString(),
      }], { onConflict: "email" });

    if (insertError) {
      console.error(
        `[AUTH-ERROR] Pending Record Creation Failed: ${insertError.message}`,
      );
      throw insertError;
    }

    // 7. Notify user
    await sendVerificationEmail(
      email,
      fullName,
      emailOtp,
      process.env.CLIENT_URL,
    );

    // Performance: Trigger a fire-and-forget cleanup of expired records occasionally
    if (Math.random() < 0.1) { // 10% chance per signup to trigger cleanup
      supabase.rpc("cleanup_expired_verifications").then(() => {}).catch((e) =>
        console.error("Cleanup error:", e)
      );
    }

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[AUTH-DEBUG] REGISTERED -> Email OTP: ${emailOtp}`,
      );
    }

    res.status(200).json({
      success: true,
      message: "Verification code sent.",
      details: { email, expiresAt: expiry },
    });
  } catch (err) {
    console.error("[Register Error]:", err.message);
    res.status(500).json({ error: "Signup failed. Please try again." });
  }
};

/**
 * CORE VERIFICATION HANDLER
 */
const handleVerificationProgress = async (
  email,
  code,
  type,
  pendingRecord = null,
) => {
  // Optimized select: Only get necessary fields
  const record = pendingRecord || await supabase.from("pending_verifications")
    .select(
      "id, email, email_otp, otp_expires_at, attempts, email_verified",
    )
    .eq("email", email)
    .maybeSingle()
    .then((r) => r.data);

  if (!record) {
    console.warn(
      `[AUTH-WARN] Verification attempt for non-existent session: ${email}`,
    );
    return {
      error: "Verification session not found. Please resend code.",
      status: 404,
    };
  }

  // Check Expiry
  if (new Date(record.otp_expires_at) < new Date()) {
    console.log(`[AUTH-INFO] Code expired for ${email}`);
    return {
      error: "Verification code expired. Please request a new one.",
      status: 400,
      expired: true,
    };
  }

  // Check Attempts (Max 5)
  if (record.attempts >= 5) {
    console.warn(`[AUTH-SECURITY] Brute-force lockout for ${email}`);
    return {
      error: "Too many failed attempts. Please resend code to reset.",
      status: 403,
    };
  }

  const isValid = code === record.email_otp;

  if (!isValid) {
    console.log(`[AUTH-INFO] Invalid email OTP attempt for ${email}`);
    await supabase.from("pending_verifications").update({
      attempts: (record.attempts || 0) + 1,
    }).eq("id", record.id);
    return { error: `Invalid verification code.`, status: 400 };
  }

  const { data: updated, error } = await supabase.from("pending_verifications")
    .update({ email_verified: true, attempts: 0 }).eq("id", record.id).select()
    .single();

  if (error) {
    console.error(`[AUTH-ERROR] Verification Update Failed: ${error.message}`);
    throw error;
  }
  return { success: true, updated };
};

const verifyOtp = async (req, res) => {
  try {
    const { email, emailOtp } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    let currentRecord = await supabase.from("pending_verifications").select("*")
      .eq("email", email).maybeSingle().then((r) => r.data);
    if (!currentRecord) {
      return res.status(404).json({ error: "Verification session not found." });
    }

    // Handle Email OTP
    if (emailOtp) {
      const resObj = await handleVerificationProgress(
        email,
        emailOtp,
        "email",
        currentRecord,
      );
      if (resObj.error) {
        return res.status(resObj.status).json({
          error: resObj.error,
          expired: resObj.expired,
        });
      }
      currentRecord = resObj.updated;
    }

    // Final Completion Check (Email Only)
    if (currentRecord.email_verified) {
      // 1. Update Profile as Verified
      await supabase.from("profiles").update({
        is_verified: true,
        terms_accepted_at: new Date().toISOString(),
      }).eq("email", email);

      // 2. Mark Auth User as Verified in Metadata
      const { data: userProfile } = await supabase.from("profiles").select("id")
        .eq("email", email).single();
      if (userProfile) {
        await supabase.auth.admin.updateUserById(userProfile.id, {
          user_metadata: { is_verified: true },
          email_confirm: true,
        });
      }

      // 3. Cleanup pending record
      await supabase.from("pending_verifications").delete().eq(
        "id",
        currentRecord.id,
      );

      return res.status(200).json({
        success: true,
        finalized: true,
        message: "Account verified! You can now access your dashboard.",
      });
    }

    res.json({
      success: true,
      finalized: false,
      message: "Email verified.",
      progress: {
        email: currentRecord.email_verified,
      },
    });
  } catch (err) {
    console.error("[VerifyOtp Error]:", err.message);
    res.status(500).json({ error: "Verification failed." });
  }
};

const resendOtp = async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required." });

    const { data: pending } = await supabase.from("pending_verifications")
      .select("*").eq("email", email).maybeSingle();
    let record = pending;

    // If no pending record, maybe they logged in and need to START verification
    if (!record) {
      const { data: profile } = await supabase.from("profiles").select("*").eq(
        "email",
        email,
      ).maybeSingle();
      if (!profile) {
        return res.status(404).json({ error: "Account not found." });
      }
      if (profile.is_verified) {
        return res.status(400).json({ error: "Account already verified." });
      }

      // Re-generate pending record
      const { data: newRecord, error } = await supabase.from(
        "pending_verifications",
      ).insert([{
        full_name: profile.full_name,
        username: profile.username,
        email: profile.email,
        password_hash: "RECOVERED",
        otp_code: "DEPRECATED",
        email_otp: "START",
        otp_expires_at: new Date().toISOString(),
      }]).select().single();
      if (error) throw error;
      record = newRecord;
    }

    // Cooldown check (60s)
    const diff = Math.floor(
      (new Date() - new Date(record.last_otp_sent_at)) / 1000,
    );
    if (diff < 60) {
      return res.status(429).json({
        error: `Please wait ${60 - diff}s before resending.`,
      });
    }

    const emailOtp = Math.floor(100000 + Math.random() * 900000).toString();

    await supabase.from("pending_verifications").update({
      email_otp: emailOtp,
      otp_expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      last_otp_sent_at: new Date().toISOString(),
      attempts: 0,
    }).eq("id", record.id);

    await sendVerificationEmail(
      email,
      record.full_name,
      emailOtp,
      process.env.CLIENT_URL,
    );

    if (process.env.NODE_ENV !== "production") {
      console.log(
        `[AUTH-DEBUG] RESEND -> Email: ${emailOtp}`,
      );
    }

    res.json({ success: true, message: "New codes sent successfully." });
  } catch (err) {
    console.error("[Resend Error]:", err.message);
    res.status(500).json({ error: "Failed to resend codes." });
  }
};

const verifyEmail = (req, res) => {
  const { email, token } = req.query;
  req.body = { email, emailOtp: token };
  return verifyOtp(req, res);
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
