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

/**
 * GET /api/admin/messaging-metrics
 * Returns complete messaging metrics for the v2 messaging delivery dashboard.
 */
const getMessagingMetrics = async (req, res, next) => {
  try {
    // 1. Messages Sent (total messages in system)
    const { count: totalSent, error: sentErr } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true });

    if (sentErr) throw sentErr;

    // 2. Messages Delivered
    const { count: totalDelivered, error: delivErr } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .not('delivered_at', 'is', null);

    if (delivErr) throw delivErr;

    // 3. Messages Read
    const { count: totalRead, error: readErr } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .not('read_at', 'is', null);

    if (readErr) throw readErr;

    // 4. V2 Telemetry Counts
    const { data: telemetry, error: telErr } = await supabase
      .from('push_delivery_telemetry')
      .select('routing_decision, socket_present, push_sent, fallback_used, provider_result')
      .eq('routing_engine_version', 'v2-messaging');

    if (telErr) throw telErr;

    let socketDeliveries = 0;
    let pushDeliveries = 0;
    let ackTimeoutFallbacks = 0;
    let pushFailures = 0;
    let successfulPushes = 0;
    let pushAttempts = 0;

    if (telemetry) {
      telemetry.forEach(t => {
        if (t.socket_present && !t.fallback_used) {
          socketDeliveries++;
        }
        if (t.push_sent) {
          pushDeliveries++;
          pushAttempts++;
          if (t.provider_result && t.provider_result.toLowerCase().includes('success')) {
            successfulPushes++;
          }
        } else if ((t.provider_result || '').toLowerCase().includes('fail')) {
          pushAttempts++;
          pushFailures++;
        }
      });
    }

    const pushSuccessRate = pushAttempts > 0
      ? Number(((successfulPushes / pushAttempts) * 100).toFixed(1))
      : 100.0;

    // 5. Calculate Average Delivery and Read Latencies
    // We'll query the recent 500 messages to compute latency metrics
    const { data: latencyData, error: latErr } = await supabase
      .from('messages')
      .select('created_at, delivered_at, read_at')
      .order('created_at', { ascending: false })
      .limit(500);

    if (latErr) throw latErr;

    let totalDeliveryTimeSec = 0;
    let deliveryCount = 0;
    let totalReadTimeSec = 0;
    let readCount = 0;
    let deliveredWithin5sCount = 0;
    const sentCountForRate = latencyData ? latencyData.length : 0;

    if (latencyData) {
      latencyData.forEach(m => {
        if (m.delivered_at && m.created_at) {
          const dt = (new Date(m.delivered_at).getTime() - new Date(m.created_at).getTime()) / 1000;
          if (dt >= 0) {
            totalDeliveryTimeSec += dt;
            deliveryCount++;
            if (dt <= 5) {
              deliveredWithin5sCount++;
            }
          }
        }
        if (m.read_at && m.delivered_at) {
          const rt = (new Date(m.read_at).getTime() - new Date(m.delivered_at).getTime()) / 1000;
          if (rt >= 0) {
            totalReadTimeSec += rt;
            readCount++;
          }
        }
      });
    }

    const avgDeliveryTime = deliveryCount > 0 ? Number((totalDeliveryTimeSec / deliveryCount).toFixed(2)) : 0;
    const avgReadTime = readCount > 0 ? Number((totalReadTimeSec / readCount).toFixed(2)) : 0;
    const deliverySuccessRate = sentCountForRate > 0
      ? Number(((deliveredWithin5sCount / sentCountForRate) * 100).toFixed(1))
      : 100.0;

    // 6. Recent message traces (last 20 logs)
    const { data: recentTraces, error: traceErr } = await supabase
      .from('push_delivery_telemetry')
      .select('id, message_id, recipient_id, socket_present, push_sent, fallback_used, provider_result, delivery_ack_received, ack_latency_ms, created_at, routing_decision, reason')
      .eq('routing_engine_version', 'v2-messaging')
      .order('created_at', { ascending: false })
      .limit(20);

    if (traceErr) throw traceErr;

    res.json({
      metrics: {
        messagesSent: totalSent || 0,
        messagesDelivered: totalDelivered || 0,
        messagesRead: totalRead || 0,
        socketDeliveries,
        pushDeliveries,
        ackTimeoutFallbacks,
        pushFailures,
        avgDeliveryTime,
        avgReadTime,
        deliverySuccessRate,
        pushSuccessRate
      },
      recentTraces: recentTraces || []
    });

  } catch (err) {
    console.error('[MessagingMetrics] Error:', err);
    next(err);
  }
};

module.exports = { getPushHealth, getMessagingMetrics };
