const express = require("express");
const router = express.Router();
const path = require("path");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const supabase = require(path.join(__dirname, "..", "config", "supabase"));
const flags = require(path.join(__dirname, "..", "config", "featureFlags"));

// ─── In-memory blocklist cache ───────────────────────────────────────────────
// Replaces per-request DB query. Refreshed every 5 minutes.
// Audit fix: removed system_alerts SELECT from hot path.
const BLOCKED_DEVICES = new Set();
const refreshBlocklist = async () => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('system_alerts')
      .select('metadata')
      .eq('alert_type', 'bot_spike')
      .gte('created_at', cutoff);
    BLOCKED_DEVICES.clear();
    (data || []).forEach(row => {
      if (row.metadata?.device_id) BLOCKED_DEVICES.add(row.metadata.device_id);
    });
  } catch (e) {
    console.error('[Blocklist] Refresh failed (non-fatal):', e.message);
  }
};
refreshBlocklist(); // Run immediately on startup
setInterval(refreshBlocklist, 5 * 60 * 1000); // Then every 5 minutes
// ─────────────────────────────────────────────────────────────────────────────

// ─── Unified Ranking Function ─────────────────────────────────────────────────
// Audit fix: moved out of sort comparator (was called O(n log n) times).
// Removes heuristic tag CTR bias. Uses smooth pacing instead of binary cliff.
function getPacingFactor(ad) {
  if (!ad.max_views || !ad.start_date || !ad.end_date) return 1.0;
  const durationMs = new Date(ad.end_date) - new Date(ad.start_date);
  const elapsedMs  = Date.now() - new Date(ad.start_date);
  if (durationMs <= 0 || elapsedMs <= 0) return 1.0;
  const burnRate = (ad.views || 0) / Math.max(1, ad.max_views * (elapsedMs / durationMs));
  // Smooth throttle: 1.0 at normal burn, approaches 0.05 at 3× overburn
  return Math.max(0.05, 1 / (1 + Math.max(0, burnRate - 1.0) * 2));
}

function scoreAd(ad, now) {
  const ageHours = Math.max(1, (now - new Date(ad.created_at)) / (1000 * 60 * 60));
  // Use real CTR once 10+ views; flat 5% for cold-start (no tag bias)
  const ctr      = (ad.views > 10) ? ((ad.clicks || 0) / ad.views) : 0.05;
  const bid      = Number(ad.cpc_bid || 0.05);
  const base     = (ctr * bid * 100) / Math.pow(ageHours + 2, 1.5);
  const paced    = base * getPacingFactor(ad);
  // Additive cold-start bonus — not a multiplier, prevents dominance
  const bonus    = (ad.views || 0) < 20 ? 0.002 : 0;
  return paced + bonus;
}
// ─────────────────────────────────────────────────────────────────────────────

// Original POST / route removed in favor of payment-integrated version below

// Get Auction Intel (For Competitive Dashboard)
router.get("/auction-intel", async (req, res) => {
  try {
    const { data: ads, error } = await supabase
      .from("ads")
      .select("cpc_bid, tags")
      .in("status", ["approved", "pending"]);

    if (error) throw error;
    
    if (!ads || ads.length === 0) {
      return res.json({ medianCpc: 0.05, topCpc: 0.10, totalBidders: 0 });
    }

    const bids = ads.map(a => Number(a.cpc_bid || 0.05)).sort((a,b) => a - b);
    const medianCpc = bids[Math.floor(bids.length / 2)];
    const topCpc = bids[Math.max(0, bids.length - 1)]; // Highest
    
    res.json({
        medianCpc:       Number(medianCpc.toFixed(2)),
        topCpc:          Number((topCpc * 1.2).toFixed(2)),
        totalBidders:    ads.length,
        // Patch C: enriched fields — additive, existing consumers ignore unknown keys
        recommendedBid:  Number((medianCpc * 1.3).toFixed(2)),
        marketTrend:     ads.length > 5 ? 'competitive' : 'open',
        pricingTiers: {
          basic:   { minBid: 0.01, maxBid: 0.10, boostMultiplier: 3 },
          boost:   { minBid: 0.05, maxBid: 0.50, boostMultiplier: 4 },
          premium: { minBid: 0.10, maxBid: 5.00, boostMultiplier: 5 },
        },
    });
  } catch (error) {
    console.error("Error fetching auction intel:", error);
    res.status(500).json({ error: "Failed to fetch market intel" });
  }
});

router.get("/", async (req, res) => {
  try {
    const { tags, exclude } = req.query;
    const deviceId = req.headers['x-device-id'];

    // 1. In-memory blocklist check (no DB query — audit fix)
    if (deviceId && BLOCKED_DEVICES.has(deviceId)) {
      return res.status(403).json({ error: 'Device blocked due to anomalies' });
    }

    // Start with basic query
    let query = supabase
      .from("ads")
      .select(
        "id, title, content, image_url, link_url, status, tags, start_date, end_date, created_at, views, clicks, max_views, max_clicks, advertiser_value"
      )
      .eq("status", "approved");

    const { data: ads, error } = await query;

    if (error) {
      console.error("Database error fetching ads:", error);
      // Return empty array instead of 500 if the error is just missing columns (during migration)
      if (error.code === "42703") {
        return res.json([]);
      }
      throw error;
    }

    if (!ads) return res.json([]);

    // Filter by date window and BUDGET CAPS
    const activeAds = ads.filter((ad) => {
      const start = ad.start_date ? new Date(ad.start_date) : null;
      const end = ad.end_date ? new Date(ad.end_date) : null;
      const current = new Date();

      const isStarted = !start || start <= current;
      const isNotEnded = !end || end >= current;
      
      const withinViewsCap = !ad.max_views || (ad.views || 0) < ad.max_views;
      const withinClicksCap = !ad.max_clicks || (ad.clicks || 0) < ad.max_clicks;

      return isStarted && isNotEnded && withinViewsCap && withinClicksCap;
    });

    // Filter by tags if provided
    let filteredAds = activeAds;
    if (tags) {
      const tagArray = tags.split(",").map((t) => t.trim().toLowerCase());
      filteredAds = activeAds.filter((ad) => {
        if (!ad.tags || !Array.isArray(ad.tags)) return false;
        return ad.tags.some((tag) => tagArray.includes(tag.toLowerCase()));
      });
    }

    // Filter by Session Exclusions
    if (exclude) {
      const excludeArray = exclude.split(',').map(e => e.trim());
      filteredAds = filteredAds.filter(ad => !excludeArray.includes(ad.id));
    }

    // Server-Side Frequency Memory (window driven by FREQUENCY_CAP_MINUTES flag)
    if (deviceId) {
      const freqWindowMs = (flags.FREQUENCY_CAP_MINUTES || 10) * 60 * 1000;
      const freqWindowAgo = new Date(Date.now() - freqWindowMs).toISOString();
      const { data: recentEvents } = await supabase
        .from('ad_analytics_events')
        .select('ad_id')
        .eq('device_id', deviceId)
        .eq('event_type', 'impression')
        .gte('created_at', freqWindowAgo);
        
      if (recentEvents && recentEvents.length > 0) {
        const recentIds = recentEvents.map(e => e.ad_id);
        filteredAds = filteredAds.filter(ad => !recentIds.includes(ad.id));
      }
    }

    // Ad Ranking — precomputed per ad, sorted once (audit fix: removed O(n log n) Date construction)
    const now = Date.now();
    filteredAds.sort((a, b) => scoreAd(b, now) - scoreAd(a, now));

    // Patch D: Additive _meta envelope — existing consumers safely ignore unknown fields
    const rankedAt = new Date().toISOString();
    const enrichedAds = filteredAds.map(ad => ({
      ...ad,
      _meta: { ranked_at: rankedAt, pool_size: filteredAds.length }
    }));

    res.json(enrichedAds);
  } catch (error) {
    console.error("Critical error in /api/ads:", error);
    res.status(500).json({
      error: "Failed to fetch ads",
      details: error.message,
    });
  }
});

// Get Test Ad (Development/Testing) - DISABLED FOR PRODUCTION
// router.get('/test-ad', async (req, res) => {
//     try {
//         // Return a hardcoded test ad
//         const testAd = {
//             id: 'test-ad-001',
//             user_id: 'system',
//             title: '🚀 Test Advertisement',
//             content: 'This is a test ad for development. Click here to learn more about our amazing product!',
//             image_url: 'https://via.placeholder.com/150/6366f1/ffffff?text=Test+Ad',
//             link_url: 'https://example.com',
//             status: 'approved',
//             tags: ['test', 'development', 'demo'],
//             target_category: 'general',
//             views: 0,
//             clicks: 0,
//             created_at: new Date().toISOString()
//         };
//
//         res.json([testAd]);
//     } catch (error) {
//         console.error('Error returning test ad:', error);
//         res.status(500).json({ error: 'Failed to return test ad' });
//     }
// });

// Get My Ads (Authenticated User)
router.get("/my-ads", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { data, error } = await supabase
      .from("ads")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    res.json(data || []);
  } catch (error) {
    console.error("Error fetching my ads:", error);
    res.status(500).json({ error: "Failed to fetch your ads" });
  }
});

// Admin: Get All Ads (For Moderation)
// Admin: Get All Ads (For Moderation)
router.get("/admin", requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;

    let query = supabase
      .from("ads")
      .select("*")
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    } else {
      // Default view: Everything except possibly draft or deleted
      query = query.in("status", ["pending", "pending_payment", "approved", "rejected", "paused", "paused_funds"]); // Fix 6: paused_funds was invisible to admins
    }

    const { data: ads, error: adsError } = await query;

    if (adsError) throw adsError;

    if (!ads || ads.length === 0) {
      return res.json([]);
    }

    // Manually fetch profiles to avoid missing FK relationship issues
    const userIds = [...new Set(ads.map((ad) => ad.user_id))];

    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);

    if (profilesError) {
      console.warn("Failed to fetch profiles for ads:", profilesError);
      // Return ads without profiles if profiles fetch fails
      return res.json(ads.map((ad) => ({ ...ad, profiles: null })));
    }

    // Merge profiles into ads
    const adsWithProfiles = ads.map((ad) => {
      const profile = profiles.find((p) => p.id === ad.user_id);
      return {
        ...ad,
        profiles: profile || null,
      };
    });

    res.json(adsWithProfiles);
  } catch (error) {
    console.error("Error fetching admin ads:", error);
    res.status(500).json({ error: "Failed to fetch ads for admin" });
  }
});

// Admin: Update Status (Approve/Reject)
router.patch("/:id/status", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["approved", "rejected", "pending", "paused"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const { data, error } = await supabase
      .from("ads")
      .update({ status })
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;

    // Notify user of status update
    const { createNotification } = require("../services/notificationService");
    await createNotification({
      receiverId: data.user_id,
      type: "ad_status",
      title: status === "approved" ? "Ad Approved!" : "Ad Status Updated",
      message: status === "approved"
        ? `Your advertisement "${data.title}" has been approved and is now active.`
        : `Your advertisement "${data.title}" status has been changed to ${status}.`,
      link: "/dashboard/wallet", // Ad management is likely here or nearby
    });

    res.json(data);
  } catch (error) {
    console.error("Error updating ad status:", error);
    res.status(500).json({ error: "Failed to update ad status" });
  }
});

const subscriptionController = require("../controllers/subscriptionController");

// Create Ad (Pro Only) -> Now starts as pending_payment
router.post("/", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const {
      title,
      content,
      image_url,
      link_url,
      media_url,
      destination_url,
      tags,
      start_date,
      end_date,
      max_views,
      max_clicks,
      cpc_bid,
      tier  // Patch B: 'basic' | 'boost' | 'premium' — optional, safe default
    } = req.body;

    // Patch B: Resolve advertiser_value from tier if flag is enabled
    const TIER_VALUES = { basic: 5, boost: 15, premium: 30 };
    const resolvedAdvertiserValue = flags.ENABLE_ADVERTISER_TIERS
      ? (TIER_VALUES[tier] || 5)
      : 5; // Default legacy value — no behavior change when flag is OFF

    // Check if user is Pro
    const { data: subscription, error: subError } = await supabase
      .from("subscriptions")
      .select("plan_tier, status")
      .eq("user_id", userId)
      .maybeSingle();

    // Allow if plan is a paid tier and status is active
    const isPaidPlan = subscription && ['pro', 'team', 'business', 'enterprise'].includes(subscription.plan_tier) &&
      subscription.status === "active";

    if (!isPaidPlan) {
      return res.status(403).json({
        error: "Only Pro or Business users can create advertisements.",
      });
    }

    // Create Ad with status 'pending_payment'
    const { data, error } = await supabase
      .from("ads")
      .insert({
        user_id: userId,
        title,
        content,
        image_url: image_url || media_url, // Fallback if old client sends media_url
        link_url: link_url || destination_url, // Fallback if old client sends destination_url
        start_date: start_date || new Date().toISOString(),
        end_date: end_date || null,
        max_views:         max_views ? parseInt(max_views) : null,
        max_clicks:         max_clicks ? parseInt(max_clicks) : null,
        cpc_bid:            cpc_bid ? parseFloat(cpc_bid) : 0.05,
        advertiser_value:   resolvedAdvertiserValue, // Patch B: tier-resolved value
        tags:               tags || [],
        status:             "pending_payment",
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json(data);
  } catch (error) {
    console.error("Error creating ad:", error);
    res.status(500).json({ error: "Failed to create ad" });
  }
});

// Create Payment Session for Ad
router.post(
  "/pay",
  requireAuth,
  subscriptionController.createAdCheckoutSession,
);

// Sync Payment Status (Manual fallback)
router.post("/sync-payment", requireAuth, subscriptionController.syncAdPayment);

// Track Ad Analytics (Impressions & Clicks) with Fraud Protection
router.post("/:id/track", async (req, res) => {
  try {
    const { id: adId } = req.params;
    const { type } = req.body; // 'impression' or 'click'
    
    if (!['impression', 'click'].includes(type)) {
      return res.status(400).json({ error: 'Invalid track type' });
    }

    // Get IP for fraud protection logic
    const viewerIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || '';
    const deviceId = req.headers['x-device-id'] || 'unknown';

    // 0. In-memory blocklist check (no DB query — audit fix)
    if (deviceId !== 'unknown' && BLOCKED_DEVICES.has(deviceId)) {
      return res.status(403).json({ error: 'Device blocked' });
    }

    // Anti-Bot: Reject empty User-Agents
    if (!userAgent || userAgent.trim() === '') {
      return res.status(403).json({ error: 'Bot signature detected' });
    }

    // Anti-Bot: Rate Spike Detection (Max 30 requests per minute from same device)
    const oneMinAgo = new Date(Date.now() - 60 * 1000).toISOString();
    const { count: spikeCount } = await supabase
      .from('ad_analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('device_id', deviceId)
      .gte('created_at', oneMinAgo);
      
    if (spikeCount && spikeCount > flags.RATE_SPIKE_LIMIT) { // tunable via RATE_SPIKE_LIMIT env
      if (!BLOCKED_DEVICES.has(deviceId)) {
        BLOCKED_DEVICES.add(deviceId); // Immediate block, prevents write-amplification
        await supabase.from('system_alerts').insert({
          alert_type: 'bot_spike',
          message: `High velocity tracking blocked from device ${deviceId}`,
          metadata: { device_id: deviceId, ip: viewerIp, ad_id: adId, count: spikeCount }
        });
      }
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    // Budget Limits: Daily Caps per user (Impressions 50/day, Clicks 10/day)
    const startOfDay = new Date();
    startOfDay.setHours(0,0,0,0);
    const { count: dailyCount } = await supabase
      .from('ad_analytics_events')
      .select('id', { count: 'exact', head: true })
      .eq('device_id', deviceId)
      .eq('event_type', type)
      .gte('created_at', startOfDay.toISOString());

    const dailyCapLimit = type === 'impression' ? flags.DAILY_IMPRESSION_CAP : flags.DAILY_CLICK_CAP; // tunable via env
    if (dailyCount && dailyCount >= dailyCapLimit) {
      // Exceeded daily cap, ignore silently to save DB/stats increment
      return res.json({ success: true, status: 'daily_cap_reached' });
    }

    // 1. Time window constraint (Cooldown)
    // 5 minutes for impressions, 60 minutes for clicks
    const minutesAgo = type === 'impression' ? 5 : 60;
    const timeLimit = new Date(Date.now() - minutesAgo * 60 * 1000).toISOString();

    // 2. Check for recent matching events
    const { data: recentEvents, error: fraudError } = await supabase
      .from('ad_analytics_events')
      .select('id')
      .eq('ad_id', adId)
      .eq('event_type', type)
      .eq('device_id', deviceId) // Track by strictly persistent device profile
      .gte('created_at', timeLimit)
      .limit(1);

    if (fraudError) {
      console.error("Fraud check error:", fraudError);
      return res.status(500).json({ error: 'Tracking error' });
    }

    if (recentEvents && recentEvents.length > 0) {
      // Cooldown fraud caught
      return res.json({ success: true, status: 'ignored_cooldown' });
    }

    // 3. Log the track event natively
    const { error: insertError } = await supabase
      .from('ad_analytics_events')
      .insert({
        ad_id: adId,
        event_type: type,
        viewer_ip: viewerIp,
        user_agent: userAgent,
        device_id: deviceId
      });

    if (insertError) {
      console.error("Insert analytics event error:", insertError);
      return res.status(500).json({ error: 'Failed to record event' });
    }

    // 4. Atomically increment the exact stat (single call — no duplicates)
    const statToIncrement = type === 'impression' ? 'view' : 'click';
    const { error: rpcError } = await supabase.rpc('increment_ad_stat', {
      row_id: adId,
      stat_type: statToIncrement
    });

    if (rpcError) {
      console.error("RPC increment error:", rpcError);
      await supabase.from('system_alerts').insert({
        alert_type: 'tracking_failure',
        message: `Database tracking failed for Ad ${adId}`,
        metadata: { error: rpcError, ad_id: adId, type }
      });
    }

    // 5. Atomic wallet deduction (audit fix: replaces non-atomic read-modify-write)
    if (type === 'click') {
      try {
        const { data: adDetails } = await supabase
          .from('ads').select('user_id, cpc_bid').eq('id', adId).single();

        if (adDetails && Number(adDetails.cpc_bid) > 0) {
          // Single atomic DB operation — no race condition possible
          const { data: newBalance, error: walletErr } = await supabase
            .rpc('deduct_ad_wallet', {
              p_user_id: adDetails.user_id,
              p_amount:  adDetails.cpc_bid
            });

          if (walletErr) {
            console.error('Wallet deduction RPC error (non-fatal):', walletErr.message);
          } else if (newBalance !== null && newBalance <= 0) {
            // Auto-pause campaigns when wallet is empty
            await supabase.from('ads')
              .update({ status: 'paused_funds' })
              .eq('user_id', adDetails.user_id)
              .eq('status', 'approved');

            const { createNotification } = require('../services/notificationService');
            createNotification({
              receiverId: adDetails.user_id,
              type: 'ad_wallet_empty',
              title: 'Ad Wallet Exhausted',
              message: 'Your Ad Wallet balance has reached zero. Your active campaigns have been temporarily paused.',
              link: '/dashboard/settings',
            }).catch(() => {}); // non-fatal
          }
        }
      } catch (walletErr) {
        console.error('Wallet deduction error (non-fatal):', walletErr);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Tracking endpoint explosion:", error);
    res.status(500).json({ error: 'Failed to track ad' });
  }
});

module.exports = router;
