const { supabase } = require("../config/supabase");

/**
 * Runs daily to clean up stale and invalid push subscriptions.
 */
async function runPushCleanup() {
  console.log("[PushCleanup] Starting daily push subscription cleanup...");
  try {
    // 1. Delete invalid subscriptions (got 403 or 410)
    const { data: deleted, error: delErr } = await supabase
      .from("push_subscriptions")
      .delete()
      .eq("status", "invalid")
      .select("id");

    if (delErr) {
      console.error("[PushCleanup] Error deleting invalid subscriptions:", delErr);
    } else if (deleted && deleted.length > 0) {
      console.log(`[PushCleanup] Deleted ${deleted.length} invalid subscriptions.`);
    }

    // 2. Mark stale subscriptions (no successful push in 30 days)
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: stale, error: staleErr } = await supabase
      .from("push_subscriptions")
      .update({ status: "stale" })
      .lt("last_successful_push_at", thirtyDaysAgo)
      .neq("status", "stale")
      .select("id");

    if (staleErr) {
      console.error("[PushCleanup] Error marking stale subscriptions:", staleErr);
    } else if (stale && stale.length > 0) {
      console.log(`[PushCleanup] Marked ${stale.length} subscriptions as stale.`);
    }

  } catch (err) {
    console.error("[PushCleanup] Unhandled error during cleanup:", err);
  }
}

/**
 * Starts the daily cron-like interval.
 */
function startPushCleanupJob() {
  // Run once immediately on startup
  runPushCleanup();

  // Then run every 24 hours
  setInterval(runPushCleanup, 24 * 60 * 60 * 1000);
}

module.exports = {
  startPushCleanupJob,
  runPushCleanup
};
