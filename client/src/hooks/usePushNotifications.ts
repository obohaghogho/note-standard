import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { API_URL } from '../lib/api';
import { toast } from 'react-hot-toast';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

  const isIOS = typeof navigator !== 'undefined' && (
    /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );

  const isStandalone = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as any).standalone === true
  );

  const supportsPush = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  const urlBase64ToUint8Array = (base64String: string) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  };

  const subscribeUser = useCallback(async () => {
    if (isIOS && !isStandalone) {
      const msg = "To enable Push Notifications on iPhone, tap the Share button 📤 in Safari and tap 'Add to Home Screen' 📱.";
      toast.error(msg, { duration: 6000 });
      throw new Error("IOS_REQUIRES_PWA");
    }

    if (!('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY) {
      const msg = 'Push notifications are not supported in this browser or VAPID key is missing';
      console.warn(msg);
      toast.error(msg);
      throw new Error("PUSH_NOT_SUPPORTED");
    }

    try {
      // Request permission if not already granted FIRST (crucial for iOS user-gesture requirement)
      if (typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
        const newPermission = await Notification.requestPermission();
        setPermission(newPermission);
        if (newPermission !== 'granted') {
          toast.error('Notification permission was denied in browser');
          return false;
        }
      }

      const registration = await navigator.serviceWorker.ready;
      if (!registration || !registration.pushManager) {
        throw new Error("PushManager unavailable on this device");
      }

      // Check for existing subscription
      let sub = await registration.pushManager.getSubscription();
      
      if (!sub) {
        // Create new subscription
        const subscribeOptions = {
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        };
        sub = await registration.pushManager.subscribe(subscribeOptions);
      }

      setSubscription(sub);
      setIsSubscribed(true);

      // Send to backend
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return true;

      const response = await fetch(`${API_URL}/api/notifications/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ 
          subscription: sub,
          vapidKeyVersion: VAPID_PUBLIC_KEY
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription on server');
      }

      // Dual-Write to V2 installation endpoint
      try {
        const { getDeviceId } = await import('../utils/deviceId');
        const deviceId = await getDeviceId();
        
        await fetch(`${API_URL}/api/notifications/register-installation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`
          },
          body: JSON.stringify({
            deviceId,
            pushEndpoint: sub.endpoint,
            pushP256dh: btoa(String.fromCharCode.apply(null, new Uint8Array(sub.getKey('p256dh')!))),
            pushAuth: btoa(String.fromCharCode.apply(null, new Uint8Array(sub.getKey('auth')!))),
            platform: 'web',
            type: 'vapid',
            reason: 'SIGNED_IN',
            capabilities: {
              supports_web_push: true,
              supports_fcm: false,
              supports_apns: false,
              supports_background_sync: 'serviceWorker' in navigator
            }
          })
        });
      } catch (v2Err) {
        console.warn('V2 Installation sync failed (non-fatal):', v2Err);
      }

      console.log('Successfully subscribed to push notifications');
      return true;
    } catch (error: any) {
      console.error('Push subscription error:', error);
      if (error.message !== "IOS_REQUIRES_PWA") {
        toast.error(error.message || 'Failed to enable push notifications');
      }
      throw error;
    }
  }, [isIOS, isStandalone]);

  const unsubscribeUser = useCallback(async () => {
    try {
      const registration = await navigator.serviceWorker.ready;
      const sub = await registration.pushManager.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        setSubscription(null);
        setIsSubscribed(false);
        // We could also notify the backend here but the backend cleanup
        // handles 410/404 errors automatically during dispatch.
      }
    } catch (error) {
      console.error('Error unsubscribing:', error);
    }
  }, []);

  useEffect(() => {
    const checkSubscription = async () => {
      if ('serviceWorker' in navigator && Notification.permission === 'granted') {
        const registration = await navigator.serviceWorker.ready;
        const sub = await registration.pushManager.getSubscription();
        setIsSubscribed(!!sub);
        setSubscription(sub);
      }
    };
    checkSubscription();

    // Fix: Keep permission state in sync with the real browser permission state.
    // Without this listener, the state is stale after the race condition or when
    // the user blocks/allows notifications in browser settings without refreshing.
    let permissionStatus: PermissionStatus | null = null;
    if (typeof navigator !== 'undefined' && navigator.permissions) {
      navigator.permissions.query({ name: 'notifications' as PermissionName }).then(status => {
        permissionStatus = status;
        // Sync immediately in case the state changed while the component was unmounted
        setPermission(status.state as NotificationPermission);
        status.onchange = () => {
          setPermission(status.state as NotificationPermission);
          // If permission was just granted, auto-check for an existing subscription
          if (status.state === 'granted') {
            checkSubscription();
          }
          // If permission was revoked, clear subscription state
          if (status.state !== 'granted') {
            setIsSubscribed(false);
            setSubscription(null);
          }
        };
      }).catch(() => {
        // navigator.permissions.query not supported — fall through silently
      });
    }

    return () => {
      if (permissionStatus) {
        permissionStatus.onchange = null;
      }
    };
  }, []);


  return {
    permission,
    isSubscribed,
    subscription,
    subscribeUser,
    unsubscribeUser
  };
}
