const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

/**
 * GET /api/admin/push-health
 * Returns a complete push notification health snapshot for the admin dashboard.
 */
const getPushHealth = async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    // ─── 1. Subscription Overview ───────────────────────────────
    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('status, platform, user_id, device_id, device_name, last_successful_push_at');

    if (subsErr) throw subsErr;

    const totalSubscriptions = subs.length;
    const healthy = subs.filter(s => s.status === 'healthy').length;
    const stale = subs.filter(s => s.status === 'stale').length;
    const invalid = subs.filter(s => s.status === 'invalid').length;

    // ─── 2. Push Success Metrics (Today) ────────────────────────
    const { data: metricsToday, error: metricsErr } = await supabase
      .from('push_metrics')
      .select('status, error_code, platform, user_id, created_at')
      .gte('created_at', todayIso)
      .order('created_at', { ascending: false });

    if (metricsErr) throw metricsErr;

    const attempted = metricsToday.filter(m => m.status === 'attempted').length;
    const accepted = metricsToday.filter(m => m.status === 'accepted').length;
    const failed = metricsToday.filter(m => m.status === 'failed').length;
    const successRate = attempted > 0 ? Math.round((accepted / attempted) * 100) : 0;

    // ─── 3. Failure Breakdown ───────────────────────────────────
    const failures = metricsToday.filter(m => m.status === 'failed');
    const failureBreakdown = {
      '403': 0, '404': 0, '410': 0, 'timeout': 0, 'other': 0
    };
    failures.forEach(f => {
      const code = String(f.error_code || '');
      if (code === '403') failureBreakdown['403']++;
      else if (code === '404') failureBreakdown['404']++;
      else if (code === '410') failureBreakdown['410']++;
      else if (code.toLowerCase().includes('timeout')) failureBreakdown['timeout']++;
      else failureBreakdown['other']++;
    });

    // ─── 4. Device Breakdown ─────────────────────────────────────
    const deviceBreakdown = { android: 0, ios: 0, desktop: 0, unknown: 0 };
    subs.forEach(s => {
      const plat = (s.platform || '').toLowerCase();
      if (plat === 'android') deviceBreakdown.android++;
      else if (plat === 'ios') deviceBreakdown.ios++;
      else if (['windows', 'macos', 'linux', 'desktop'].some(p => plat.includes(p))) deviceBreakdown.desktop++;
      else deviceBreakdown.unknown++;
    });

    // ─── 5. Top Users With Multiple Devices ─────────────────────
    const userDeviceMap = {};
    subs.forEach(s => {
      if (!s.user_id) return;
      if (!userDeviceMap[s.user_id]) userDeviceMap[s.user_id] = new Set();
      if (s.device_id) userDeviceMap[s.user_id].add(s.device_id);
    });
    const topMultiDevice = Object.entries(userDeviceMap)
      .map(([user_id, devices]) => ({ user_id, device_count: devices.size }))
      .filter(u => u.device_count > 1)
      .sort((a, b) => b.device_count - a.device_count)
      .slice(0, 10);

    // ─── 6. Recent Activity (last 50 push events) ────────────────
    const { data: recentActivity, error: recentErr } = await supabase
      .from('push_metrics')
      .select('created_at, user_id, platform, status, error_code')
      .order('created_at', { ascending: false })
      .limit(50);

    if (recentErr) throw recentErr;

    res.json({
      overview: { totalSubscriptions, healthy, stale, invalid },
      metricsToday: { attempted, accepted, failed, successRate },
      failureBreakdown,
      deviceBreakdown,
      topMultiDevice,
      recentActivity: recentActivity.map(r => ({
        timestamp: r.created_at,
        user_id: r.user_id,
        platform: r.platform || 'Unknown',
        result: r.status,
        error_code: r.error_code || null,
      }))
    });

  } catch (err) {
    console.error('[PushHealth] Error:', err);
    next(err);
  }
};

module.exports = { getPushHealth };
