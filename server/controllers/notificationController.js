const supabase = require("../config/supabase");

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
    const { subscription } = req.body;

    if (!subscription) {
      return res.status(400).json({ error: "Subscription is required" });
    }

    const { error } = await supabase
      .from("push_subscriptions")
      .upsert({ user_id: userId, subscription }, {
        onConflict: "user_id, subscription",
      });

    if (error) throw error;

    res.json({ message: "Subscribed to push notifications" });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  subscribeToNotifications,
};
