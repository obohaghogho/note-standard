const { createClient } = require('@supabase/supabase-js');
const http  = require('http');
const https = require('https');

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
      .select('status, platform, user_id, device_id, device_name, last_successful_push_at, last_failed_push_at, created_at, updated_at, vapid_key_version');

    if (subsErr) throw subsErr;

    const totalSubscriptions = subs.length;
    const healthy = subs.filter(s => s.status === 'healthy').length;
    const stale = subs.filter(s => s.status === 'stale').length;
    const invalid = subs.filter(s => s.status === 'invalid').length;
    const neverPushed = subs.filter(s => !s.last_successful_push_at).length;
    const duplicateEndpointUsers = (() => {
      const counts = {};
      subs.forEach(s => { if (s.user_id) counts[s.user_id] = (counts[s.user_id] || 0) + 1; });
      return Object.values(counts).filter(c => c > 1).length;
    })();

    // ─── 2. User Coverage ────────────────────────────────────────
    // How many of all registered users actually have a push subscription?
    const { data: allProfiles, error: profilesErr } = await supabase
      .from('profiles')
      .select('id');

    if (profilesErr) throw profilesErr;

    const subscribedUserIds = new Set(subs.map(s => s.user_id).filter(Boolean));
    const totalUsers = allProfiles ? allProfiles.length : 0;
    const usersWithSubscription = subscribedUserIds.size;
    const usersWithoutSubscription = totalUsers - usersWithSubscription;
    const coveragePct = totalUsers > 0
      ? Math.round((usersWithSubscription / totalUsers) * 100)
      : 0;

    // ─── 3. Push Success Metrics (Today) ────────────────────────
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

    // ─── 4. Failure Breakdown ───────────────────────────────────
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

    // ─── 5. Device Breakdown ─────────────────────────────────────
    const deviceBreakdown = { android: 0, ios: 0, desktop: 0, unknown: 0 };
    subs.forEach(s => {
      const plat = (s.platform || '').toLowerCase();
      if (plat === 'android') deviceBreakdown.android++;
      else if (plat === 'ios') deviceBreakdown.ios++;
      else if (['windows', 'macos', 'linux', 'desktop'].some(p => plat.includes(p))) deviceBreakdown.desktop++;
      else deviceBreakdown.unknown++;
    });

    // ─── 6. Top Users With Multiple Devices ─────────────────────
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

    // ─── 7. Per-User Health Status ───────────────────────────────
    // Classify every user by their notification health state.
    // This is the key diagnostic table for investigating why specific users
    // receive or don't receive notifications.
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Build subscription map keyed by user_id
    const subsByUser = {};
    subs.forEach(s => {
      if (!s.user_id) return;
      if (!subsByUser[s.user_id]) subsByUser[s.user_id] = [];
      subsByUser[s.user_id].push(s);
    });

    const perUserHealth = (allProfiles || []).map(profile => {
      const userSubs = subsByUser[profile.id] || [];

      if (userSubs.length === 0) {
        return {
          user_id: profile.id,
          health: 'NO_SUBSCRIPTION',
          health_label: '🔴 No Subscription',
          subscription_count: 0,
          last_successful_push: null,
          last_failed_push: null,
          platforms: [],
          details: 'User has no push subscription. Auto-recovery will register on next app open.',
        };
      }

      const invalidSubs = userSubs.filter(s => s.status === 'invalid');
      const staleSubs   = userSubs.filter(s => s.status === 'stale' ||
        (s.last_successful_push_at && s.last_successful_push_at < thirtyDaysAgo));
      const hasAnySuccessfulPush = userSubs.some(s => s.last_successful_push_at);
      const lastSuccess = userSubs
        .map(s => s.last_successful_push_at).filter(Boolean)
        .sort().pop() || null;
      const lastFail = userSubs
        .map(s => s.last_failed_push_at).filter(Boolean)
        .sort().pop() || null;

      let health, health_label, details;

      if (invalidSubs.length === userSubs.length) {
        health = 'INVALID_ENDPOINT';
        health_label = '🔴 Invalid Endpoint';
        details = `All ${invalidSubs.length} subscription(s) are marked INVALID (HTTP 403/410). Device must re-register.`;
      } else if (!hasAnySuccessfulPush && lastFail) {
        health = 'PUSH_FAILED';
        health_label = '🔴 Push Failed';
        details = `Subscription exists but push has never succeeded. Last failure: ${lastFail}`;
      } else if (!hasAnySuccessfulPush) {
        health = 'NEVER_PUSHED';
        health_label = '🟡 Never Pushed';
        details = `Subscription exists but no successful push recorded yet. May be newly registered.`;
      } else if (staleSubs.length > 0) {
        health = 'STALE';
        health_label = '🟡 Stale Subscription';
        details = `${staleSubs.length} subscription(s) inactive for 30+ days.`;
      } else if (invalidSubs.length > 0) {
        health = 'PARTIALLY_INVALID';
        health_label = '🟡 Partially Invalid';
        details = `${invalidSubs.length} of ${userSubs.length} subscription(s) are INVALID.`;
      } else {
        health = 'HEALTHY';
        health_label = '🟢 Healthy';
        details = `${userSubs.length} active subscription(s). Last push: ${lastSuccess}`;
      }

      return {
        user_id: profile.id,
        health,
        health_label,
        subscription_count: userSubs.length,
        last_successful_push: lastSuccess,
        last_failed_push: lastFail,
        platforms: [...new Set(userSubs.map(s => s.platform || 'unknown'))],
        details,
      };
    });

    // Sort: problems first (NO_SUBSCRIPTION, INVALID, PUSH_FAILED, NEVER_PUSHED, STALE, HEALTHY)
    const healthOrder = {
      'NO_SUBSCRIPTION': 0,
      'INVALID_ENDPOINT': 1,
      'PUSH_FAILED': 2,
      'NEVER_PUSHED': 3,
      'PARTIALLY_INVALID': 4,
      'STALE': 5,
      'HEALTHY': 6,
    };
    perUserHealth.sort((a, b) => (healthOrder[a.health] ?? 9) - (healthOrder[b.health] ?? 9));

    // ─── 8. Recent Activity (last 50 push events) ────────────────
    const { data: recentActivity, error: recentErr } = await supabase
      .from('push_metrics')
      .select('created_at, user_id, platform, status, error_code')
      .order('created_at', { ascending: false })
      .limit(50);

    if (recentErr) throw recentErr;

    res.json({
      overview: { totalSubscriptions, healthy, stale, invalid, neverPushed, duplicateEndpointUsers },
      coverage: {
        totalUsers,
        usersWithSubscription,
        usersWithoutSubscription,
        coveragePct,
      },
      metricsToday: { attempted, accepted, failed, successRate },
      failureBreakdown,
      deviceBreakdown,
      topMultiDevice,
      perUserHealth: perUserHealth.slice(0, 100), // cap at 100 rows for response size
      perUserHealthSummary: {
        healthy: perUserHealth.filter(u => u.health === 'HEALTHY').length,
        no_subscription: perUserHealth.filter(u => u.health === 'NO_SUBSCRIPTION').length,
        never_pushed: perUserHealth.filter(u => u.health === 'NEVER_PUSHED').length,
        push_failed: perUserHealth.filter(u => u.health === 'PUSH_FAILED').length,
        invalid_endpoint: perUserHealth.filter(u => u.health === 'INVALID_ENDPOINT').length,
        stale: perUserHealth.filter(u => u.health === 'STALE').length,
        partially_invalid: perUserHealth.filter(u => u.health === 'PARTIALLY_INVALID').length,
      },
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

/**
 * POST /api/admin/push-health/test-push/:userId
 *
 * Sends a REAL test push notification to all registered subscriptions for a
 * specific user and returns whether the gateway accepted it.
 *
 * Steps:
 *   1. Confirm subscriptions exist for userId in DB
 *   2. POST to gateway /internal/push with a diagnostic payload
 *   3. Log a push_metric entry (type='test_push') so the result appears in the
 *      activity feed within the health dashboard
 *   4. Return gateway HTTP status + subscription count to the caller
 */
const sendTestPush = async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    // 1. Check subscriptions exist
    const { data: subs, error: subsErr } = await supabase
      .from('push_subscriptions')
      .select('endpoint, status, platform, device_id')
      .eq('user_id', userId);

    if (subsErr) throw subsErr;

    const validSubs = (subs || []).filter(s => s.status !== 'invalid');

    // 2. Confirm device_installations exist (V2 path)
    const { data: installs } = await supabase
      .from('device_installations')
      .select('installation_id, push_endpoint, endpoint_status, type')
      .eq('user_id', userId)
      .neq('endpoint_status', 'INVALID');

    const gatewayUrl = process.env.REALTIME_GATEWAY_URL || 'http://localhost:5001';
    const now = new Date().toISOString();

    const payload = JSON.stringify({
      userId,
      title: '🔔 Test Notification',
      body:  'Admin sent a test push. If you see this, push is working.',
      payload: {
        type:    'admin_test_push',
        url:     '/dashboard/notifications',
        testSentAt: now,
        sentBy:  req.user?.id || 'admin',
      },
    });

    // 3. Call gateway /internal/push
    let gatewayStatus = null;
    let gatewayBody   = '';

    await new Promise((resolve) => {
      const targetUrl = new URL('/internal/push', gatewayUrl);
      const lib = targetUrl.protocol === 'https:' ? https : http;

      const request = lib.request({
        hostname: targetUrl.hostname,
        port:     targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        path:     targetUrl.pathname,
        method:   'POST',
        headers:  {
          'Content-Type':   'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 12000,
      }, (gwRes) => {
        gatewayStatus = gwRes.statusCode;
        gwRes.on('data', (chunk) => { gatewayBody += chunk; });
        gwRes.on('end',  resolve);
      });

      request.on('error',   (err) => { gatewayBody = err.message; resolve(); });
      request.on('timeout', ()    => { request.destroy(); gatewayBody = 'timeout'; resolve(); });
      request.write(payload);
      request.end();
    });

    const accepted = gatewayStatus >= 200 && gatewayStatus < 300;

    // 4. Log test push metric so it appears in the dashboard activity feed
    await supabase.from('push_metrics').insert([{
      platform:    'web',
      push_type:   'test_push',
      status:      accepted ? 'attempted' : 'failed',
      error_code:  accepted ? null : String(gatewayStatus || 'gateway_error'),
      user_id:     userId,
      device_id:   null,
    }]);

    console.log(`[PushHealth] Test push for user ${userId}: gateway=${gatewayStatus} subs=${validSubs.length} installs=${(installs||[]).length}`);

    return res.json({
      success: accepted,
      userId,
      gatewayStatus,
      gatewayResponse: (() => { try { return JSON.parse(gatewayBody); } catch { return gatewayBody; } })(),
      subscriptionCount: validSubs.length,
      v2InstallationCount: (installs || []).length,
      platforms: [...new Set(validSubs.map(s => s.platform || 'unknown'))],
      sentAt: now,
      note: validSubs.length === 0
        ? 'No valid subscriptions found for this user. Auto-recovery will register on next app open.'
        : accepted
          ? 'Gateway accepted the push. Check the user\'s device — notification should appear within seconds.'
          : 'Gateway rejected the push. Check gateway logs for details.',
    });

/**
 * GET /api/admin/message-inspector/:messageId
 *
 * Per-Message Lifecycle Inspector: returns the complete trace timeline
 * for any given message ID across DB, Gateway, Socket, Push, and ACK stages.
 */
const getMessageInspectorTrace = async (req, res, next) => {
  try {
    const { messageId } = req.params;
    if (!messageId) return res.status(400).json({ error: 'messageId is required' });

    // 1. Fetch message record
    const { data: message, error: msgErr } = await supabase
      .from('messages')
      .select('id, conversation_id, sender_id, content, type, event_id, created_at, delivered_at, read_at, sender:profiles(id, username, full_name, avatar_url)')
      .eq('id', messageId)
      .maybeSingle();

    if (msgErr) throw msgErr;
    if (!message) return res.status(404).json({ error: 'Message not found' });

    // 2. Fetch telemetry entries for this message
    const { data: telemetry } = await supabase
      .from('push_delivery_telemetry')
      .select('*')
      .eq('message_id', messageId);

    // 3. Build ordered lifecycle timeline
    const createdTs = new Date(message.created_at).getTime();
    const deliveredTs = message.delivered_at ? new Date(message.delivered_at).getTime() : null;
    const readTs = message.read_at ? new Date(message.read_at).getTime() : null;
    const ackLatencyMs = deliveredTs ? (deliveredTs - createdTs) : null;

    const timeline = [
      { stage: 'Created', timestamp: message.created_at, status: 'SUCCESS' },
      { stage: 'Stored in DB', timestamp: message.created_at, status: 'SUCCESS' }
    ];

    if (telemetry && telemetry.length > 0) {
      const t = telemetry[0];
      timeline.push({
        stage: 'Gateway Routed',
        timestamp: t.created_at || message.created_at,
        status: 'SUCCESS',
        socketPresent: t.socket_present,
        routingDecision: t.routing_decision
      });

      if (t.socket_present) {
        timeline.push({ stage: 'Socket Sent', timestamp: t.created_at, status: 'SUCCESS' });
      }

      if (t.push_sent) {
        timeline.push({
          stage: 'Push Dispatched',
          timestamp: t.created_at,
          status: 'SUCCESS',
          providerResult: t.provider_result
        });
      }
    }

    if (message.delivered_at) {
      timeline.push({
        stage: 'Delivery ACK Received (First Device Wins)',
        timestamp: message.delivered_at,
        status: 'SUCCESS',
        ackLatencyMs
      });
      timeline.push({
        stage: 'delivered_at Updated in DB (Sender Sees Double Gray Check ✓✓)',
        timestamp: message.delivered_at,
        status: 'SUCCESS'
      });
    } else {
      timeline.push({
        stage: 'Delivery ACK Pending (Sender Sees Single Check ✓)',
        timestamp: null,
        status: 'PENDING'
      });
    }

    if (message.read_at) {
      timeline.push({
        stage: 'Read ACK Received (Sender Sees Double Blue Check ✓✓)',
        timestamp: message.read_at,
        status: 'SUCCESS'
      });
    }

    res.json({
      messageId: message.id,
      conversationId: message.conversation_id,
      eventId: message.event_id,
      sender: message.sender,
      type: message.type,
      ackLatencyMs,
      delivered: !!message.delivered_at,
      read: !!message.read_at,
      timeline,
      telemetry: telemetry || []
    });

  } catch (err) {
    console.error('[MessageInspector] Error:', err);
    next(err);
  }
};

module.exports = { getPushHealth, getMessagingMetrics, sendTestPush, getMessageInspectorTrace };

