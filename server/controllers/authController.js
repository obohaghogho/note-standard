const bcrypt = require("bcryptjs");
const axios = require("axios");
const crypto = require("crypto");
const supabase = require("../config/database");
const env = require("../config/env");
const mailService = require("../services/mailService");
const geoip = require("geoip-lite");

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
      device_id,
      platform,
    } = req.body;

    // Support both naming conventions
    fullName = fullName || full_name;
    // Generate username from email if not provided (mobile doesn't send it)
    if (!username && email) {
      username = email.split('@')[0] + Math.floor(Math.random() * 1000);
    }

    // 1. reCAPTCHA check
    // Mobile apps are exempt via an explicit header they send on every request.
    // We intentionally do NOT use !req.headers.origin as a bypass — that would
    // allow any curl/Postman call with no origin header to skip verification.
    const isMobileClient =
      req.headers['x-client-type'] === 'mobile' ||
      req.headers['x-client-info']?.includes('mobile');

    if (env.RECAPTCHA_SECRET_KEY && env.NODE_ENV === "production" && !isMobileClient) {
      if (!captchaToken) {
        return res.status(400).json({ error: "Please complete the robot verification." });
      }
      const verify = await axios.post(
        `https://www.google.com/recaptcha/api/siteverify?secret=${env.RECAPTCHA_SECRET_KEY}&response=${captchaToken}`,
      );
      if (!verify.data.success) {
        const errorCodes = verify.data['error-codes'] || [];
        console.warn(`[AUTH-WARN] reCAPTCHA failed for ${email}`, errorCodes);
        // timeout-or-duplicate is specifically a token expiry error
        const isExpired = errorCodes.includes('timeout-or-duplicate');
        return res.status(400).json({
          error: isExpired
            ? "Verification expired. Please complete the check again."
            : "Robot verification failed. Please try again.",
          code: "RECAPTCHA_FAILED",
        });
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
    // the profile record. We will now proactively create wallets for the user.
    const walletService = require("../services/walletService");
    const currencies = ["NGN", "USD", "GBP", "ETH"];
    
    // Fire and forget wallet creation so it doesn't block the response
    Promise.all(currencies.map(curr => 
      walletService.createWallet(authData.user.id, curr).catch(e => 
        console.error(`[AUTH-WALLET] Failed to auto-create ${curr} wallet:`, e.message)
      )
    ));

    // Create initial device + session record (same as login flow)
    const deviceId = device_id || crypto.randomUUID();
    const sessionId = crypto.randomUUID();

    // Sign in immediately to get a real Supabase session token
    const { data: sessionData } = await supabase.auth.signInWithPassword({ email, password });
    
    let sessionId_out = sessionId;
    let token_out = null;
    let refresh_token_out = null;

    if (sessionData?.session) {
      token_out = sessionData.session.access_token;
      refresh_token_out = sessionData.session.refresh_token;

      await supabase.from('user_devices').upsert({
        device_id: deviceId,
        user_id: authData.user.id,
        platform: platform || 'unknown',
        last_seen: new Date(),
        updated_at: new Date()
      }, { onConflict: 'device_id' });

      const refreshHash = crypto.createHash('sha256').update(refresh_token_out).digest('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await supabase.from('user_sessions').insert({
        session_id: sessionId,
        user_id: authData.user.id,
        device_id: deviceId,
        refresh_token_hash: refreshHash,
        token_state: 'valid',
        expires_at: expiresAt
      });
    }

    // 4. Send Welcome Email (Confirmation)
    // We send this as a background task to not block the response
    mailService.sendWelcomeEmail(email, fullName).catch(err => {
      console.error("[AUTH-WARN] Failed to send welcome email:", err.message);
    });

    // 5. Send Admin Alert for New Registration
    const xForwardedFor = req.headers['x-forwarded-for'] || '';
    let clientIp = xForwardedFor.split(',')[0].trim();
    if (!clientIp) {
      clientIp = req.ip || req.socket?.remoteAddress || 'Unknown';
    }
    const geo = geoip.lookup(clientIp);
    const countryCode = geo ? geo.country : 'Unknown';

    mailService.sendNewRegistrationAdminAlert(email, fullName, username, clientIp, countryCode).catch(err => {
      console.error("[AUTH-WARN] Failed to send admin alert email:", err.message);
    });

    res.status(200).json({
      success: true,
      message: "Registration successful! You can now log in.",
      token: token_out,
      refresh_token: refresh_token_out,
      session_id: sessionId,
      device_id: deviceId,
      user: {
        id: authData.user.id,
        email: authData.user.email,
        username: username,
        full_name: fullName,
        plan_tier: 'FREE'
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
    const { email, password, device_id, platform } = req.body;

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

    // Fetch real profile data to get plan_tier, country_code, and username (with fallback)
    const { data: profile, error: pError } = await supabase
      .from("profiles")
      .select("username, full_name, avatar_url, plan_tier, country_code")
      .eq("id", data.user.id)
      .single();

    if (pError) {
      console.warn("[Auth] Profile enrichment failed, using metadata:", pError.message);
    }

    // --- IP & COUNTRY TRACKING (SECURITY UPGRADE) ---
    const xForwardedFor = req.headers['x-forwarded-for'] || '';
    let clientIp = xForwardedFor.split(',')[0].trim();
    if (!clientIp) {
      clientIp = req.ip || req.socket?.remoteAddress || 'Unknown';
    }
    const ipList = xForwardedFor ? xForwardedFor.split(',') : [];

    let isProxy = false;
    if (
      ipList.length > 1 || 
      req.headers['via'] || 
      req.headers['x-forwarded-host'] || 
      req.headers['proxy-connection']
    ) {
      isProxy = true;
    }

    const geo = geoip.lookup(clientIp);
    const countryCode = geo ? geo.country : null;
    const finalIpString = isProxy && clientIp ? `${clientIp} (Proxy)` : clientIp;

    if (profile && profile.country_code && countryCode) {
      if (profile.country_code !== countryCode) {
        // Country Changed! Trigger Security Alert
        const { createNotification } = require('../services/notificationService');
        await createNotification({
          receiverId: data.user.id,
          type: 'security_alert',
          title: 'Unusual Login Location',
          message: `We detected a login from a new country/region (${countryCode}). If this was not you, please secure your account immediately.`,
          link: '/settings/security'
        }).catch(err => console.error("[Security] Failed to send location change notification:", err.message));
      }
    }

    // Persist new IP and Country
    if (clientIp) {
      const { error: updateError } = await supabase.from('profiles').update({
        last_ip: finalIpString,
        country_code: countryCode
      }).eq('id', data.user.id);
      
      if (updateError) {
        console.error("[Security] Failed to update profile IP during login:", updateError.message);
      }
    }
    // --- END SECURITY UPGRADE ---

    // Multi-Device Session Logic
    const deviceId = device_id || crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    
    // Upsert device
    await supabase.from('user_devices').upsert({
      device_id: deviceId,
      user_id: data.user.id,
      platform: platform || 'unknown',
      last_seen: new Date(),
      updated_at: new Date()
    }, { onConflict: 'device_id' });

    // Hash refresh token
    const refreshHash = crypto.createHash('sha256').update(data.session.refresh_token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    await supabase.from('user_sessions').insert({
      session_id: sessionId,
      user_id: data.user.id,
      device_id: deviceId,
      refresh_token_hash: refreshHash,
      token_state: 'valid',
      expires_at: expiresAt
    });

    res.status(200).json({
      success: true,
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      session_id: sessionId,
      device_id: deviceId,
      user: {
        id: data.user.id,
        email: data.user.email,
        username: profile?.username || data.user.user_metadata?.username,
        full_name: profile?.full_name || data.user.user_metadata?.full_name,
        avatar_url: profile?.avatar_url || data.user.user_metadata?.avatar_url,
        plan_tier: profile?.plan_tier || 'FREE'
      }
    });
  } catch (err) {
    console.error("[Login Error]:", err.message);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
};

/**
 * Refreshes the access token using the refresh token
 */
const refreshToken = async (req, res) => {
  try {
    const { refresh_token, session_id, device_id } = req.body;
    if (!refresh_token || !session_id) {
      return res.status(400).json({ error: "Refresh token and session ID are required." });
    }

    // Verify Session Ownership
    const { data: sessionData } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('session_id', session_id)
      .single();

    if (!sessionData || sessionData.token_state !== 'valid') {
      return res.status(401).json({ error: "Session is invalid or revoked." });
    }
    
    if (device_id && sessionData.device_id !== device_id) {
      return res.status(401).json({ error: "Device mismatch for session." });
    }

    const providedHash = crypto.createHash('sha256').update(refresh_token).digest('hex');
    if (providedHash !== sessionData.refresh_token_hash) {
      return res.status(401).json({ error: "Invalid refresh token." });
    }

    const { data, error } = await supabase.auth.refreshSession({
      refresh_token: refresh_token,
    });

    if (error) {
      console.error("[AUTH-ERROR] Token refresh failed:", error.message);
      // Mark as invalid if it fails permanently
      if (error.message.includes("invalid") || error.message.includes("expired")) {
         await supabase.from('user_sessions').update({ token_state: 'invalid' }).eq('session_id', session_id);
      }
      return res.status(401).json({ error: error.message });
    }

    const newHash = crypto.createHash('sha256').update(data.session.refresh_token).digest('hex');
    await supabase.from('user_sessions').update({
      refresh_token_hash: newHash,
      last_active: new Date()
    }).eq('session_id', session_id);

    res.status(200).json({
      success: true,
      token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      session_id: session_id,
      user: {
        id: data.user.id,
        email: data.user.email,
      }
    });
  } catch (err) {
    console.error("[Refresh Error]:", err.message);
    res.status(500).json({ error: "Failed to refresh token." });
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

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.id;

    if (!newPassword) {
      return res.status(400).json({ error: "New password is required" });
    }

    // Supabase Auth change password
    const { error } = await supabase.auth.admin.updateUserById(userId, {
      password: newPassword
    });

    if (error) {
      console.error("[AUTH-ERROR] Change password failed:", error.message);
      return res.status(400).json({ error: error.message });
    }

    res.json({ success: true, message: "Password updated successfully" });
  } catch (err) {
    console.error("[ChangePassword Error]:", err.message);
    res.status(500).json({ error: "Failed to change password" });
  }
};

const registerSession = async (req, res) => {
  try {
    const { device_id, platform, _supabase_access_token } = req.body;

    if (!_supabase_access_token) {
      return res.status(400).json({ error: 'Access token required.' });
    }

    // Validate the Supabase token to get the user — no password needed
    const { data: { user }, error: authError } = await supabase.auth.getUser(_supabase_access_token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    // --- IP & COUNTRY TRACKING (SECURITY UPGRADE) ---
    const xForwardedFor = req.headers['x-forwarded-for'] || '';
    let clientIp = xForwardedFor.split(',')[0].trim();
    if (!clientIp) {
      clientIp = req.ip || req.socket?.remoteAddress || 'Unknown';
    }
    const ipList = xForwardedFor ? xForwardedFor.split(',') : [];

    // Proxy / VPN Detection Heuristic
    let isProxy = false;
    if (
      ipList.length > 1 || 
      req.headers['via'] || 
      req.headers['x-forwarded-host'] || 
      req.headers['proxy-connection']
    ) {
      isProxy = true;
    }

    // GeoResolve IP
    const geo = geoip.lookup(clientIp);
    const countryCode = geo ? geo.country : null;

    const finalIpString = isProxy && clientIp ? `${clientIp} (Proxy)` : clientIp;

    // Fetch old profile data to detect unusual locations
    const { data: profile } = await supabase
      .from('profiles')
      .select('last_ip, country_code')
      .eq('id', user.id)
      .single();

    if (profile && profile.country_code && countryCode) {
      if (profile.country_code !== countryCode) {
        // Country Changed! Trigger Security Alert via Notification Service
        const { createNotification } = require('../services/notificationService');
        await createNotification({
          receiverId: user.id,
          type: 'security_alert',
          title: 'Unusual Login Location',
          message: `We detected a login from a new country/region (${countryCode}). If this was not you, please secure your account immediately.`,
          link: '/settings/security'
        }).catch(err => console.error("[Security] Failed to send location change notification:", err.message));
      }
    }

    // Persist new IP and Country
    if (clientIp) {
      const { error: updateError } = await supabase.from('profiles').update({
        last_ip: finalIpString,
        country_code: countryCode
      }).eq('id', user.id);
      
      if (updateError) {
        console.error("[Security] Failed to update profile IP during registerSession:", updateError.message);
      }
    }
    // --- END SECURITY UPGRADE ---

    // Also get a fresh session to get refresh token for hashing
    const { data: sessionData } = await supabase.auth.admin.getUserById(user.id);
    
    const deviceId = device_id || crypto.randomUUID();
    const sessionId = crypto.randomUUID();

    await supabase.from('user_devices').upsert({
      device_id: deviceId,
      user_id: user.id,
      platform: platform || 'web',
      last_seen: new Date(),
      updated_at: new Date()
    }, { onConflict: 'device_id' });

    // Use access token hash as a stand-in (web flow; refresh token not exposed)
    const tokenHash = crypto.createHash('sha256').update(_supabase_access_token).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await supabase.from('user_sessions').insert({
      session_id: sessionId,
      user_id: user.id,
      device_id: deviceId,
      refresh_token_hash: tokenHash,
      token_state: 'valid',
      expires_at: expiresAt
    });

    res.status(200).json({ success: true, session_id: sessionId, device_id: deviceId });

    // FIX: Invalidate the chatPush installation cache in the gateway.
    // The gateway caches push installation endpoints per-user. When a new session is
    // registered, the session_state transitions from null → ACTIVE in installation_accounts.
    // If the cache still holds a stale entry with no ACTIVE sessions, the very first push
    // to this user after login will be silently skipped (the "first message no push" bug).
    // We clear the cache here so the next push performs a fresh DB read.
    const gatewayUrl = process.env.REALTIME_GATEWAY_URL || 'http://localhost:5000';
    const http = gatewayUrl.startsWith('https') ? require('https') : require('http');
    const cacheBody = JSON.stringify({ userId: user.id });
    const cacheReq = http.request({
      hostname: new URL(gatewayUrl).hostname,
      port: new URL(gatewayUrl).port || (gatewayUrl.startsWith('https') ? 443 : 80),
      path: '/internal/cache/clear',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(cacheBody) },
      timeout: 5000,
    }, () => {}); // fire-and-forget
    cacheReq.on('error', () => {}); // silence errors silently
    cacheReq.write(cacheBody);
    cacheReq.end();

  } catch (err) {
    console.error('[RegisterSession Error]:', err.message);
    res.status(500).json({ error: 'Failed to register session.' });
  }
};

const logout = async (req, res) => {
  try {
    const { session_id } = req.body;
    
    if (session_id) {
      // 1. V2 Push Migration: Set installation_accounts to LOGGED_OUT
      const { data: session } = await supabase
        .from('user_sessions')
        .select('device_id, user_id')
        .eq('session_id', session_id)
        .single();

      if (session && session.device_id) {
        const { data: installation } = await supabase
          .from('device_installations')
          .select('installation_id')
          .eq('device_id', session.device_id)
          .single();

        if (installation) {
          await supabase.from('installation_accounts').update({
            session_state: 'LOGGED_OUT',
            updated_at: new Date()
          }).match({
            installation_id: installation.installation_id,
            user_id: session.user_id
          });
          console.log(`[Push V2] Marked installation ${installation.installation_id} as LOGGED_OUT for user ${session.user_id}`);
        }
      }

      // 2. Revoke the standard session
      await supabase.from('user_sessions').update({ 
        token_state: 'revoked', 
        revoked_at: new Date() 
      }).eq('session_id', session_id);
    }

    // Hybrid logout: Also clear supabase token context if possible
    // Note: client side will also clear its tokens
    
    res.json({ success: true, message: "Logged out successfully" });
  } catch (err) {
    console.error("[Logout Error]:", err.message);
    res.status(500).json({ error: "Failed to logout" });
  }
};

module.exports = {
  register,
  login,
  changePassword,
  verifyEmail,
  verifyOtp,
  resendOtp,
  forgotPassword,
  refreshToken,
  logout,
  registerSession,
};
