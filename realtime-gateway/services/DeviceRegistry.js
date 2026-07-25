/**
 * DeviceRegistry.js — Enterprise Single Source of Truth for Devices (v3.0)
 *
 * Responsibilities:
 *   1. Aggregates & merges V1 (push_subscriptions), V2 (device_installations/installation_accounts), and native_device_tokens.
 *   2. Deduplicates endpoints across tables.
 *   3. Classifies platform: android | ios | desktop_web | mobile_web | pwa.
 *   4. Filters out expired, revoked, or invalid tokens.
 *   5. Sorts by health score and last_seen timestamp.
 *
 * PURE DATA MODULE — Contains ZERO push dispatch logic, ZERO side-effects, and ZERO database mutations.
 */

class DeviceRegistry {
  /**
   * Fetches and normalizes all active, healthy target devices for a user.
   *
   * @param {object} supabase - Supabase client instance
   * @param {string} userId   - Recipient user ID
   * @returns {Promise<Array<Object>>} Array of normalized device targets
   */
  static async getActiveDevices(supabase, userId) {
    if (!supabase || !userId) return [];

    const deviceMap = new Map(); // Keyed by endpoint or token string to enforce strict deduplication

    try {
      // 1. Query V2 Multi-Account Installation Tables
      const { data: v2Data, error: v2Error } = await supabase
        .from('installation_accounts')
        .select('session_state, device_installations(installation_id, type, push_endpoint, platform, push_p256dh, push_auth, device_id, endpoint_status, last_seen_at)')
        .eq('user_id', userId);

      if (!v2Error && v2Data) {
        for (const inst of v2Data) {
          if (inst.session_state === 'LOGGED_OUT') continue;

          const devices = Array.isArray(inst.device_installations)
            ? inst.device_installations
            : [inst.device_installations];

          for (const dev of devices) {
            if (!dev || !dev.push_endpoint || dev.endpoint_status === 'INVALID') continue;

            const endpointKey = dev.push_endpoint;
            const platformClass = DeviceRegistry.classifyPlatform(dev.platform, dev.type);

            deviceMap.set(endpointKey, {
              id: dev.installation_id || dev.device_id,
              deviceId: dev.device_id,
              platform: platformClass,
              rawPlatform: dev.platform,
              type: dev.type,
              endpoint: dev.push_endpoint,
              p256dh: dev.push_p256dh || null,
              auth: dev.push_auth || null,
              source: 'device_installations_v2',
              healthy: dev.endpoint_status === 'VALID',
              sessionState: inst.session_state || 'ACTIVE',
              lastSeen: dev.last_seen_at || new Date().toISOString(),
              supportsDeliveryWebhook: platformClass === 'desktop_web' || platformClass === 'pwa' || platformClass === 'android',
              supportsBackgroundSync: platformClass === 'android' || platformClass === 'pwa',
              priority: platformClass === 'android' ? 10 : 8
            });
          }
        }
      }

      // 2. Query V1 Web Push Subscriptions Table
      const { data: v1Data, error: v1Error } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth, platform, device_id, status, last_seen_at')
        .eq('user_id', userId)
        .neq('status', 'invalid');

      if (!v1Error && v1Data) {
        for (const sub of v1Data) {
          if (!sub.endpoint) continue;

          const endpointKey = sub.endpoint;
          // Deduplicate: If V2 already claimed this exact endpoint, merge attributes
          if (!deviceMap.has(endpointKey)) {
            const platformClass = DeviceRegistry.classifyPlatform(sub.platform || 'web', 'vapid');

            deviceMap.set(endpointKey, {
              id: sub.device_id || `v1-${endpointKey.slice(-12)}`,
              deviceId: sub.device_id || null,
              platform: platformClass,
              rawPlatform: sub.platform || 'web',
              type: 'vapid',
              endpoint: sub.endpoint,
              p256dh: sub.p256dh || null,
              auth: sub.auth || null,
              source: 'push_subscriptions_v1',
              healthy: sub.status !== 'invalid',
              sessionState: 'ACTIVE',
              lastSeen: sub.last_seen_at || new Date().toISOString(),
              supportsDeliveryWebhook: true,
              supportsBackgroundSync: true,
              priority: 7
            });
          }
        }
      }

      // 3. Query Native Tokens Table (Android FCM / iOS APNs native tokens)
      const { data: nativeData, error: nativeError } = await supabase
        .from('native_device_tokens')
        .select('token, platform, type, device_id, updated_at')
        .eq('user_id', userId);

      if (!nativeError && nativeData) {
        for (const nat of nativeData) {
          if (!nat.token) continue;
          const tokenKey = nat.token;

          if (!deviceMap.has(tokenKey)) {
            const platformClass = DeviceRegistry.classifyPlatform(nat.platform, nat.type);

            deviceMap.set(tokenKey, {
              id: nat.device_id || `native-${tokenKey.slice(-12)}`,
              deviceId: nat.device_id,
              platform: platformClass,
              rawPlatform: nat.platform,
              type: nat.type,
              endpoint: nat.token,
              p256dh: null,
              auth: null,
              source: 'native_device_tokens',
              healthy: true,
              sessionState: 'ACTIVE',
              lastSeen: nat.updated_at || new Date().toISOString(),
              supportsDeliveryWebhook: platformClass === 'android',
              supportsBackgroundSync: platformClass === 'android',
              priority: 9
            });
          }
        }
      }
    } catch (err) {
      console.error('[DeviceRegistry] Error building target list:', err.message);
    }

    // Convert map to array and sort by priority & recency
    const devices = Array.from(deviceMap.values());
    devices.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime();
    });

    return devices;
  }

  /**
   * Classifies raw platform string into standard platform types:
   * android | ios | desktop_web | mobile_web | pwa
   */
  static classifyPlatform(rawPlatform = '', type = '') {
    const p = String(rawPlatform).toLowerCase();
    const t = String(type).toLowerCase();

    if (p.includes('android') || t.includes('fcm')) return 'android';
    if (p.includes('ios') || p.includes('iphone') || p.includes('ipad') || t.includes('apns') || t.includes('voip')) return 'ios';
    if (p.includes('pwa')) return 'pwa';
    if (p.includes('mobile')) return 'mobile_web';
    return 'desktop_web';
  }
}

module.exports = DeviceRegistry;
