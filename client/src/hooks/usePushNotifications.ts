import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;
const API_URL = import.meta.env.VITE_API_URL || 'https://note-standard-api.onrender.com';

export function usePushNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);

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
    if (!('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY) {
      console.warn('Push notifications not supported or missing VAPID key');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      
      // Request permission if not already granted
      if (Notification.permission !== 'granted') {
        const newPermission = await Notification.requestPermission();
        setPermission(newPermission);
        if (newPermission !== 'granted') return;
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
      if (!session) return;

      const response = await fetch(`${API_URL}/api/notifications/subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        },
        body: JSON.stringify({ subscription: sub })
      });

      if (!response.ok) {
        throw new Error('Failed to save subscription on server');
      }

      console.log('Successfully subscribed to push notifications');
    } catch (error) {
      console.error('Push subscription error:', error);
    }
  }, []);

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
  }, []);

  return {
    permission,
    isSubscribed,
    subscription,
    subscribeUser,
    unsubscribeUser
  };
}
