import { useEffect } from 'react';
import { supabase } from '../lib/supabase';

const API_URL = import.meta.env.VITE_API_URL || '';

/**
 * useInstallationSync
 *
 * Phase 1.5: Boot-time sync hook.
 * Fires once per login session to ensure every existing push subscriber is
 * registered in the new V2 device_installations tables without requiring
 * the user to re-enable notifications or rotate their token.
 *
 * This is the critical fix for the "zero installations" problem: previously,
 * V2 registration only happened when the user FIRST enabled push notifications.
 * Devices that were already subscribed before this migration would never populate
 * the new tables. This hook closes that gap by re-registering on every auth load.
 */
export function useInstallationSync(userId: string | null | undefined) {
  useEffect(() => {
    if (!userId) return;
    if (!('serviceWorker' in navigator)) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const sync = async () => {
      try {
        console.log('[V2 Sync] Boot-time installation sync started for user:', userId);

        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();

        if (!sub) {
          console.log('[V2 Sync] No push subscription found — skipping.');
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          console.warn('[V2 Sync] No auth session found — skipping.');
          return;
        }

        const { getDeviceId } = await import('../utils/deviceId');
        const deviceId = await getDeviceId();
        const subJson = sub.toJSON();

        const endpoint = subJson.endpoint || sub.endpoint;
        let p256dh = subJson.keys?.p256dh || null;
        let auth = subJson.keys?.auth || null;

        if (!p256dh && sub.getKey) {
          try {
            const rawP256dh = sub.getKey('p256dh');
            if (rawP256dh) {
              const bytes = new Uint8Array(rawP256dh);
              let binary = '';
              for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
              p256dh = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            }
          } catch { /* noop */ }
        }

        if (!auth && sub.getKey) {
          try {
            const rawAuth = sub.getKey('auth');
            if (rawAuth) {
              const bytes = new Uint8Array(rawAuth);
              let binary = '';
              for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
              auth = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            }
          } catch { /* noop */ }
        }

        console.log('[V2 Sync] Syncing installation. deviceId:', deviceId, 'endpoint:', endpoint ? endpoint.substring(0, 40) + '...' : 'NULL');

        const resp = await fetch(`${API_URL}/api/notifications/register-installation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            deviceId,
            pushEndpoint: endpoint,
            pushP256dh: p256dh || undefined,
            pushAuth: auth || undefined,
            platform: 'web',
            type: 'vapid',
            capabilities: {
              supports_web_push: true,
              supports_fcm: false,
              supports_apns: false,
              supports_background_sync: 'serviceWorker' in navigator
            },
            reason: 'WEB_BOOT'
          })
        });

        if (resp.ok) {
          const data = await resp.json();
          console.log('[V2 Sync] ✅ Installation synced successfully. installation_id:', data?.installation_id);
        } else {
          const errData = await resp.json().catch(() => ({}));
          console.error('[V2 Sync] ❌ Server rejected sync. status:', resp.status, 'error:', errData?.error);
        }
      } catch (err) {
        console.warn('[V2 Sync] Boot-time sync non-fatal warning (server initializing/offline):', err instanceof Error ? err.message : String(err));
      }
    };


    sync();
  }, [userId]);
}
