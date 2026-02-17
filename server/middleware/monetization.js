const supabase = require("../config/supabase");

/**
 * Middleware to check user plan and attach it to req.user
 */
const checkUserPlan = async (req, res, next) => {
  try {
    if (!req.user) return next();

    const { data: subscription, error } = await supabase
      .from("subscriptions")
      .select("plan_type, status")
      .eq("user_id", req.user.id)
      .single();

    if (error || !subscription) {
      req.user.plan = "FREE";
    } else {
      req.user.plan = subscription.status === "active"
        ? subscription.plan_type
        : "FREE";
    }
    next();
  } catch (err) {
    console.error("Error in checkUserPlan middleware:", err);
    req.user.plan = "FREE";
    next();
  }
};

/**
 * Middleware to ensure user has accepted terms/privacy
 */
const checkConsent = async (req, res, next) => {
  try {
    if (!req.user) return next();

    const { data: profile, error } = await supabase
      .from("profiles")
      .select("user_consent")
      .eq("id", req.user.id)
      .single();

    if (error || !profile?.user_consent) {
      return res.status(403).json({
        error: "User consent required",
        code: "CONSENT_REQUIRED",
        message:
          "You must accept our Terms of Service and Privacy Policy to perform this action.",
      });
    }

    // Update last IP and device for compliance/fraud monitoring
    await supabase.from("profiles").update({
      last_ip: req.ip,
      last_device: req.headers["user-agent"],
    }).eq("id", req.user.id);

    next();
  } catch (err) {
    console.error("Error in checkConsent middleware:", err);
    next();
  }
};

module.exports = {
  checkUserPlan,
  checkConsent,
};
