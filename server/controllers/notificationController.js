const supabase = require("../config/database");
const notificationService = require("../services/notificationService");

const getNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("receiver_id", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;
    res.json(data);
  } catch (err) {
    next(err);
  }
};

const getUnreadCount = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { count, error } = await supabase
      .from("notifications")
      .select("*", { count: "exact", head: true })
      .eq("receiver_id", userId)
      .eq("is_read", false);

    if (error) throw error;
    res.json({ count: count || 0 });
  } catch (err) {
    next(err);
  }
};

const markAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("receiver_id", userId)
      .select();

    if (error) throw error;
    res.json(data[0]);
  } catch (err) {
    next(err);
  }
};

const markAllAsRead = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { error } = await supabase.rpc("mark_all_notifications_as_read", {
      p_user_id: userId,
    });

    if (error) {
      // Fallback if RPC fails
      const { error: updateError } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("receiver_id", userId)
        .eq("is_read", false);

      if (updateError) throw updateError;
    }

    res.json({ message: "All notifications marked as read" });
  } catch (err) {
    next(err);
  }
};

/**
 * Subscribes a user to push notifications
 */
const subscribeToNotifications = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { subscription, vapidKeyVersion, deviceId, deviceName, platform } = req.body;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "Subscription endpoint is required" });
    }

    const { endpoint, keys } = subscription;
    const p256dh = keys?.p256dh;
    const auth = keys?.auth;

    if (!p256dh || !auth) {
      return res.status(400).json({ error: "Subscription keys missing" });
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({ 
        user_id: userId, 
        endpoint, 
        p256dh, 
        auth,
        vapid_key_version: vapidKeyVersion || null,
        status: 'healthy',
        device_id: deviceId || null,
        device_name: deviceName || null,
        platform: platform || null,
        last_seen_at: new Date().toISOString()
      }, {
        onConflict: "endpoint",
      });

    if (error) throw error;

    res.json({ message: "Subscribed to push notifications" });
  } catch (err) {
    next(err);
  }
};

/**
 * Synchronizes the browser's active endpoint with the database.
 * Deletes any subscriptions for this user that don't match the current endpoint.
 */
const syncEndpoint = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { currentEndpoint, deviceId } = req.body;

    if (!currentEndpoint) {
      return res.status(400).json({ error: "currentEndpoint is required" });
    }

    if (!deviceId) {
      // If client didn't send deviceId, we shouldn't recklessly delete endpoints.
      return res.json({ message: "No deviceId provided, skipping aggressive sync" });
    }

    // Delete ONLY subscriptions for THIS user AND THIS device that do NOT match the current endpoint
    const { error } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("user_id", userId)
      .eq("device_id", deviceId)
      .neq("endpoint", currentEndpoint);

    if (error) throw error;

    res.json({ message: "Endpoints synchronized" });
  } catch (err) {
    next(err);
  }
};

const deleteNotification = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("receiver_id", userId);

    if (error) throw error;
    res.json({ message: "Notification deleted" });
  } catch (err) {
    next(err);
  }
};

const deleteAllNotifications = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("receiver_id", userId);

    if (error) throw error;
    res.json({ message: "All notifications deleted" });
  } catch (err) {
    next(err);
  }
};

/**
 * Sends a security notification on login
 */
const notifyLogin = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    
    await notificationService.createNotification({
      receiverId: userId,
      type: "login_alert",
      title: "Security Alert",
      message: "New login detected on your NoteStandard account.",
      link: "/dashboard"
    });

    res.json({ success: true, message: "Login notification triggered" });
  } catch (err) {
    // We log but don't fail the login if notification fails
    console.error("Login notification failed:", err);
    res.json({ success: false, error: err.message });
  }
};

/**
 * Registers a native device token (FCM for Android or VoIP for iOS)
 */
const registerNativeToken = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    const { token, platform, type, deviceId } = req.body;

    if (!token || !platform || !type || !deviceId) {
      return res.status(400).json({ error: "Token, platform, type, and deviceId are required" });
    }

    // First, delete any existing token mapping for this token to prevent unique constraint violations on token
    await supabase
      .from("native_device_tokens")
      .delete()
      .eq("token", token);

    const { error } = await supabase
      .from("native_device_tokens")
      .upsert({
        user_id: userId,
        token,
        platform,
        type,
        device_id: deviceId,
        updated_at: new Date().toISOString()
      }, {
        onConflict: "device_id,type",
      });

    if (error) throw error;

    res.json({ success: true, message: "Native token registered successfully" });
  } catch (err) {
    next(err);
  }
};

/**
 * Registers an installation and associates the current user (Phase 1 V2 Multi-Account)
 */
const registerInstallation = async (req, res, next) => {
  try {
    const { id: userId } = req.user;
    
    console.log(`[FORENSIC] registerInstallation CALLED by user ${userId}`);
    console.log(`[FORENSIC] Payload:`, JSON.stringify(req.body, null, 2));
    
    const { 
      deviceId, 
      pushEndpoint, 
      pushP256dh, 
      pushAuth, 
      platform, 
      type,
      capabilities 
    } = req.body;

    if (!deviceId || !platform || !type) {
      console.error(`[FORENSIC] Missing required fields. deviceId: ${deviceId}, platform: ${platform}, type: ${type}`);
      return res.status(400).json({ error: "deviceId, platform, and type are required" });
    }

    // 1. Upsert Device Installation
    console.log(`[FORENSIC] Upserting device_installations for deviceId: ${deviceId}`);
    const { data: installation, error: instError } = await supabase
      .from("device_installations")
      .upsert({
        device_id: deviceId,
        push_endpoint: pushEndpoint || null,
        push_p256dh: pushP256dh || null,
        push_auth: pushAuth || null,
        platform,
        type,
        capabilities: capabilities || { supports_web_push: false, supports_fcm: false, supports_apns: false, supports_background_sync: false },
        token_updated_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
        last_registration_source: type
      }, {
        onConflict: "device_id"
      })
      .select("installation_id")
      .single();

    if (instError) {
      console.error("[FORENSIC][Push V2] Error upserting device_installations:", instError);
      throw instError;
    }
    
    console.log(`[FORENSIC] device_installations upsert SUCCESS. installation_id: ${installation.installation_id}`);

    // 2. Upsert Installation Account Link
    console.log(`[FORENSIC] Upserting installation_accounts for installation_id: ${installation.installation_id}, user_id: ${userId}`);
    const { error: accError } = await supabase
      .from("installation_accounts")
      .upsert({
        installation_id: installation.installation_id,
        user_id: userId,
        session_state: 'ACTIVE',
        updated_at: new Date().toISOString()
      }, {
        onConflict: "installation_id,user_id"
      });

    if (accError) {
      console.error("[FORENSIC][Push V2] Error upserting installation_accounts:", accError);
      throw accError;
    }

    console.log(`[FORENSIC] installation_accounts upsert SUCCESS`);
    res.json({ success: true, message: "Installation registered successfully", installation_id: installation.installation_id });
  } catch (err) {
    console.error("[FORENSIC] registerInstallation CATCH BLOCK:", err.message);
    next(err);
  }
};

/**
 * Generic endpoint to send a notification from the frontend
 */
const sendNotification = async (req, res, next) => {
  try {
    const { id: senderId } = req.user;
    const { receiverId, type, title, message, link } = req.body;

    if (!receiverId || !type || !title) {
      return res.status(400).json({ error: "receiverId, type, and title are required" });
    }

    await notificationService.createNotification({
      receiverId,
      senderId,
      type,
      title,
      message,
      link,
    });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

/**
 * Endpoint to notify all members of a team (except sender)
 */
const notifyTeam = async (req, res, next) => {
  try {
    const { id: senderId } = req.user;
    const { teamId, type, title, message, link } = req.body;

    if (!teamId || !type || !title) {
      return res.status(400).json({ error: "teamId, type, and title are required" });
    }

    // Get all team members
    const { data: members, error } = await supabase
      .from("team_members")
      .select("user_id")
      .eq("team_id", teamId)
      .neq("user_id", senderId);

    if (error) throw error;

    if (members && members.length > 0) {
      // Send notifications in parallel
      await Promise.all(
        members.map(member => 
          notificationService.createNotification({
            receiverId: member.user_id,
            senderId,
            type,
            title,
            message,
            link,
          })
        )
      );
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getNotifications,
  getUnreadCount,
  markAsRead,
  markAllAsRead,
  subscribeToNotifications,
  deleteNotification,
  deleteAllNotifications,
  notifyLogin,
  registerNativeToken,
  registerInstallation,
  sendNotification,
  notifyTeam,
  syncEndpoint,
};
