import React, { createContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { toast } from 'react-hot-toast';
import { API_URL } from '../lib/api';
import { AnimatePresence } from 'framer-motion';
import NotificationToast, { type NotificationToastData } from '../components/common/NotificationToast';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDeviceId, getDeviceMetadata } from '../utils/deviceId';

interface Notification {
    id: string;
    receiver_id: string;
    sender_id?: string;
    type: string;
    title: string;
    message?: string;
    link?: string;
    is_read: boolean;
    created_at: string;
    sender?: {
        username: string;
        avatar_url: string;
    };
    status?: string;
}

export interface NotificationContextValue {
    notifications: Notification[];
    loading: boolean;
    unreadCount: number;
    markAsRead: (id: string) => Promise<void>;
    markAllAsRead: () => Promise<void>;
    deleteNotification: (id: string) => Promise<void>;
    clearAllNotifications: () => Promise<void>;
    clearState: () => void;
    reinitialize: () => Promise<void>;
}

export const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
    const { user, session, authReady, isSwitching } = useAuth();
    const { socket, connected } = useSocket();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [currentToast, setCurrentToast] = useState<NotificationToastData | null>(null);
    const [queue, setQueue] = useState<NotificationToastData[]>([]);
    const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);
    const navigate = useNavigate();
    const location = useLocation();

    const dismissCurrent = useCallback(() => {
        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }
        setCurrentToast(null);
    }, []);

    // Queue processor
    useEffect(() => {
        if (!currentToast && queue.length > 0) {
            const next = queue[0];
            setQueue(prev => prev.slice(1));
            setCurrentToast(next);
        }
    }, [currentToast, queue]);

    // Dedicated Auto-dismiss timer manager
    useEffect(() => {
        if (currentToast) {
            // Clear any existing timer
            if (dismissTimerRef.current) {
                clearTimeout(dismissTimerRef.current);
            }
            
            // Set a new 5s timer
            dismissTimerRef.current = setTimeout(() => {
                dismissCurrent();
            }, 5000);
        }
        
        return () => {
            if (dismissTimerRef.current) {
                clearTimeout(dismissTimerRef.current);
            }
        };
    }, [currentToast, dismissCurrent]);

    const isMounted = useRef(true);
    const notificationsFetchRef = useRef(false);
    // ─── Subscription mutex (single-flight lock) ────────────────────────────────
    // Prevents concurrent subscription attempts from visibilitychange + focus +
    // login + periodic check all firing simultaneously.
    const pushSubscribeRef = useRef(false);
    const pushSubscribePromise = useRef<Promise<void> | null>(null);
    const periodicCheckTimer = useRef<ReturnType<typeof setInterval> | null>(null);

    const unreadCount = notifications.filter(n => !n.is_read).length;

    const fetchNotifications = useCallback(async () => {
        // Rule 7 & 12: Remove profile identity check. Respect isSwitching.
        if (!session || isSwitching || notificationsFetchRef.current) return;
        notificationsFetchRef.current = true;
        
        try {
            const res = await fetch(`${API_URL}/api/notifications`, {
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            
            if (res.ok) {
                const data = await res.json();
                if (isMounted.current) setNotifications(data);
            }
        } catch (err) {
            console.warn('[Notifications] Fetch warning (server initializing):', err instanceof Error ? err.message : String(err));
        } finally {

            if (isMounted.current) setLoading(false);
            notificationsFetchRef.current = false;
        }
    }, [session, isSwitching]);

    const urlBase64ToUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const rawData = window.atob(base64);
        const outputArray = new Uint8Array(rawData.length);
        for (let i = 0; i < rawData.length; ++i) {
            outputArray[i] = rawData.charCodeAt(i);
        }
        return outputArray;
    };

    // ─── Core subscribe implementation (called by all recovery paths) ──────────
    const _doSubscribe = useCallback(async (reason: string): Promise<void> => {
        if (!session || isSwitching) return;
        if (!('serviceWorker' in navigator && 'PushManager' in window)) {
            console.warn(`[PushRecovery][${reason}] Push NOT supported — user may need to install the PWA`);
            return;
        }

        const isIOSPWA = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
        const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;

        console.log(`[PushRecovery][${reason}] Starting. permission=${Notification.permission} isIOSPWA=${isIOSPWA}`);

        if (!vapidKey) {
            console.error(`[PushRecovery][${reason}] ❌ Missing VITE_VAPID_PUBLIC_KEY — cannot subscribe`);
            return;
        }

        // ── Step 1: Wait for Service Worker with retry ──────────────────────────
        // SW may still be installing when this runs. We wait with exponential backoff.
        let registration: ServiceWorkerRegistration | null = null;
        const swDelays = [0, 2000, 5000, 10000];
        for (const delay of swDelays) {
            if (delay > 0) {
                console.log(`[PushRecovery][${reason}] SW not ready — retrying in ${delay}ms...`);
                await new Promise(r => setTimeout(r, delay));
            }
            try {
                // navigator.serviceWorker.ready resolves when SW is active
                // We use a race with a timeout so we don't block forever
                registration = await Promise.race([
                    navigator.serviceWorker.ready,
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error('SW ready timeout')), 8000))
                ]) as ServiceWorkerRegistration;
                console.log(`[PushRecovery][${reason}] ✅ SW ready. scope=${registration.scope}`);
                break;
            } catch {
                registration = null;
                console.warn(`[PushRecovery][${reason}] SW not ready (attempt ${swDelays.indexOf(delay) + 1}/${swDelays.length})`);
            }
        }

        if (!registration) {
            console.error(`[PushRecovery][${reason}] ❌ Service Worker never became ready after all retries. Aborting.`);
            return;
        }

        // ── Step 2: Check + validate existing subscription ──────────────────────
        let subscription = await registration.pushManager.getSubscription();
        console.log(`[PushRecovery][${reason}] Existing subscription: ${subscription ? subscription.endpoint.slice(0, 40) + '...' : 'none'}`);

        if (subscription) {
            // VAPID key validation: if subscription was created with a different key
            // it will always return 403. Unsubscribe and create fresh.
            const existingKey = subscription.options?.applicationServerKey;
            if (existingKey) {
                const existingKeyB64 = btoa(String.fromCharCode(...new Uint8Array(existingKey)));
                const normalizedExisting = existingKeyB64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                const normalizedCurrent = vapidKey.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
                if (normalizedExisting !== normalizedCurrent) {
                    console.warn(`[PushRecovery][${reason}] ⚠️ VAPID key MISMATCH — unsubscribing stale subscription and re-registering.`);
                    await subscription.unsubscribe();
                    subscription = null;
                } else {
                    console.log(`[PushRecovery][${reason}] ✅ VAPID key matches current server key.`);
                }
            }
        }

        // ── Step 3: Create new subscription if missing ───────────────────────────
        if (!subscription) {
            let perm = Notification.permission;
            if (perm === 'default') {
                console.log(`[PushRecovery][${reason}] Requesting browser notification permission...`);
                try {
                    perm = await Notification.requestPermission();
                } catch (permErr) {
                    console.warn(`[PushRecovery][${reason}] requestPermission error:`, permErr);
                }
            }

            if (perm !== 'granted') {
                console.log(`[PushRecovery][${reason}] Permission state: ${perm}. Cannot subscribe.`);
                return;
            }
            try {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidKey)
                });
                console.log(`[PushRecovery][${reason}] ✅ Created fresh push subscription.`);
            } catch (subErr) {
                console.error(`[PushRecovery][${reason}] ❌ pushManager.subscribe() failed:`, subErr);
                return;
            }
        }

        // ── Step 4: Sync with backend ────────────────────────────────────────────
        const deviceId = await getDeviceId();
        const { device_name, platform } = getDeviceMetadata();
        console.log(`[PushRecovery][${reason}] Syncing with backend. deviceId=${deviceId} platform=${platform}`);

        try {
            const subRes = await fetch(`${API_URL}/api/notifications/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    subscription: subscription.toJSON ? subscription.toJSON() : subscription,
                    vapidKeyVersion: vapidKey,
                    deviceId,
                    deviceName: device_name,
                    platform
                })
            });
            console.log(`[PushRecovery][${reason}] Backend /subscribe → HTTP ${subRes.status}`);
        } catch (err) {
            console.warn(`[PushRecovery][${reason}] /subscribe non-fatal warning (server initializing):`, err instanceof Error ? err.message : String(err));
        }


        // ── Step 5: Clean up stale endpoints on this device ────────────────────
        try {
            const syncRes = await fetch(`${API_URL}/api/notifications/sync-endpoint`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    currentEndpoint: subscription.endpoint,
                    deviceId
                })
            });
            console.log(`[PushRecovery][${reason}] Backend /sync-endpoint → HTTP ${syncRes.status}`);
        } catch (err) {
            console.warn(`[PushRecovery][${reason}] /sync-endpoint failed (non-fatal):`, err);
        }

        if (isIOSPWA) console.log(`[PushRecovery][${reason}] ✅ iOS PWA push subscription registered successfully`);
        console.log(`[PushRecovery][${reason}] ✅ Subscription recovery complete.`);
    }, [session, isSwitching]);

    // ─── Public subscribeToPush with mutex (single-flight lock) ────────────────
    // Multiple triggers (login + focus + visibility + periodic) may fire within
    // milliseconds of each other. The mutex ensures only one attempt runs at a time.
    const subscribeToPush = useCallback(async (reason = 'MANUAL') => {
        if (!session || isSwitching) return;
        // If a subscription attempt is already in flight, wait for it rather than
        // launching a duplicate.
        if (pushSubscribePromise.current) {
            console.log(`[PushRecovery][${reason}] Subscription already in progress — waiting for existing attempt.`);
            return pushSubscribePromise.current;
        }
        pushSubscribeRef.current = true;
        const attempt = _doSubscribe(reason).finally(() => {
            pushSubscribeRef.current = false;
            pushSubscribePromise.current = null;
        });
        pushSubscribePromise.current = attempt;
        return attempt;
    }, [session, isSwitching, _doSubscribe]);


    // ─── Initial Fetch / Identity Switch Reset ──────────────────────────────────
    useEffect(() => {
        if (!authReady) return;

        isMounted.current = true;
        
        if (session && user) {
            console.log(`[Notifications] Identity change or initial load: ${user.id}`);
            setNotifications([]);
            setLoading(true);
            fetchNotifications();
            subscribeToPush('AUTH_CHANGE');
        } else if (!session) {
            setNotifications([]);
            setLoading(false);
        }

        return () => { 
            isMounted.current = false;
        };
    // NOTE: Intentionally excludes `session` and callbacks to prevent token-refresh loops.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [authReady, user?.id]);

    // ─── Auto-recovery: visibilitychange + focus ─────────────────────────────────
    // Fires subscribeToPush whenever the user returns to the app, covering:
    //   • tab switch back
    //   • phone unlock / foreground return
    //   • desktop window focus
    //   • PWA reinstall (full page load triggers both authReady and visibilitychange)
    useEffect(() => {
        if (!session || !user) return;

        const onVisible = () => {
            if (document.visibilityState === 'visible') {
                console.log('[PushRecovery] visibilitychange → visible, triggering recovery');
                subscribeToPush('VISIBILITY_CHANGE');
            }
        };
        const onFocus = () => {
            console.log('[PushRecovery] window focus, triggering recovery');
            subscribeToPush('WINDOW_FOCUS');
        };

        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onFocus);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onFocus);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, user?.id]);

    // ─── Periodic subscription health check (every 6 hours) ─────────────────────
    // Keeps long-lived sessions healthy. Verifies that the subscription still
    // exists and is synced with the backend even if the user never refreshes.
    useEffect(() => {
        if (!session || !user) return;

        const SIX_HOURS_MS = 6 * 60 * 60 * 1000;

        // Clear any existing timer before setting a new one
        if (periodicCheckTimer.current) clearInterval(periodicCheckTimer.current);

        periodicCheckTimer.current = setInterval(() => {
            console.log('[PushRecovery] Periodic 6-hour subscription health check triggered.');
            subscribeToPush('PERIODIC_6H');
        }, SIX_HOURS_MS);

        return () => {
            if (periodicCheckTimer.current) {
                clearInterval(periodicCheckTimer.current);
                periodicCheckTimer.current = null;
            }
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session, user?.id]);

    const markAsRead = useCallback(async (id: string) => {
        if (!session) return;
        try {
            const res = await fetch(`${API_URL}/api/notifications/${id}/read`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (res.ok && isMounted.current) {
                setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
            }
        } catch (err) {
            console.error('[Notifications] Failed to mark as read:', err);
        }
    }, [session]);

    const markAllAsRead = useCallback(async () => {
        if (!session) return;
        try {
            const res = await fetch(`${API_URL}/api/notifications/read-all`, {
                method: 'PATCH',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (res.ok && isMounted.current) {
                setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            }
        } catch (err) {
            console.error('[Notifications] Failed to mark all as read:', err);
        }
    }, [session]);

    const deleteNotification = useCallback(async (id: string) => {
        if (!session) return;
        try {
            const res = await fetch(`${API_URL}/api/notifications/${id}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (res.ok && isMounted.current) {
                setNotifications(prev => prev.filter(n => n.id !== id));
                toast.success('Notification deleted');
            }
        } catch (err) {
            console.error('[Notifications] Failed to delete:', err);
            toast.error('Failed to delete notification');
        }
    }, [session]);

    // Socket listeners
    useEffect(() => {
        if (!socket || !connected) return;

        const onNotification = (notification: Notification) => {
            if (!isMounted.current) return;
            
            // Suppress chat notifications if the user is actively viewing that specific conversation
            if (notification.type === 'chat_message' || notification.type === 'message') {
                const isChatPage = location.pathname.includes('/chat');
                
                if (isChatPage) {
                    // Extract the conversation ID from the notification link (e.g. /dashboard/chat?id=<uuid>)
                    let notifConversationId: string | null = null;
                    if (notification.link) {
                        try {
                            const linkUrl = new URL(notification.link, window.location.origin);
                            notifConversationId = linkUrl.searchParams.get('id');
                        } catch {
                            // If parsing fails, fall back to string extraction
                            const match = notification.link.match(/[?&]id=([^&]+)/);
                            notifConversationId = match ? match[1] : null;
                        }
                    }

                    // Extract the currently active conversation ID from the browser URL
                    const currentParams = new URLSearchParams(location.search);
                    const activeConversationId = currentParams.get('id');

                    // If user is already looking at this exact conversation → fully suppress the toast
                    // AND mark it as read immediately so no badge accumulates
                    if (notifConversationId && activeConversationId && notifConversationId === activeConversationId) {
                        console.log('[Notifications] Suppressing chat notification — user is already in this conversation:', notifConversationId);
                        // Silently mark as read on the server (fire-and-forget)
                        markAsRead(notification.id);
                        // Still add to list (silently marked read) so history is intact
                        setNotifications(prev => [{ ...notification, is_read: true }, ...prev]);
                        return;
                    }

                    // User is on the chat page but in a DIFFERENT conversation → show the toast
                    console.log('[Notifications] Showing chat notification — user is in a different conversation');
                }
            }

            setNotifications(prev => [notification, ...prev]);

            const toastData: NotificationToastData = {
                id: notification.id,
                title: notification.title,
                message: notification.message,
                type: notification.type,
                link: notification.link,
                sender: notification.sender,
                count: 1
            };

            // Grouping logic for messages
            if (notification.type === 'chat_message' || notification.type === 'message') {
                // Check current toast
                if (currentToast && (currentToast.sender?.username === notification.sender?.username || currentToast.title === notification.title)) {
                    setCurrentToast(prev => prev ? {
                        ...prev,
                        message: notification.message,
                        count: (prev.count || 1) + 1
                    } : null);
                    return;
                }


                // Check queue
                const queueIndex = queue.findIndex(q => q.sender?.username === notification.sender?.username || q.title === notification.title);
                if (queueIndex !== -1) {
                    setQueue(prev => {
                        const newQueue = [...prev];
                        newQueue[queueIndex] = {
                            ...newQueue[queueIndex],
                            message: notification.message,
                            count: (newQueue[queueIndex].count || 1) + 1
                        };
                        return newQueue;
                    });
                    return;
                }
            }

            // Otherwise add to queue
            setQueue(prev => [...prev, toastData]);
        };

        socket.off('notification', onNotification);
        socket.on('notification', onNotification);
        return () => {
            socket.off('notification', onNotification);
        };
    }, [socket, connected, markAsRead, currentToast, queue, dismissCurrent, location.pathname, location.search]);

    const clearAllNotifications = useCallback(async () => {
        if (!session) return;
        if (!window.confirm('Are you sure you want to clear all notifications?')) return;
        
        try {
            const res = await fetch(`${API_URL}/api/notifications`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${session.access_token}` }
            });
            if (res.ok && isMounted.current) {
                setNotifications([]);
                toast.success('All notifications cleared');
            }
        } catch (err) {
            console.error('[Notifications] Failed to clear all:', err);
            toast.error('Failed to clear notifications');
        }
    }, [session]);

    const clearState = useCallback(() => {
        console.log(`[ACCOUNT_FORENSIC] NOTIFICATION_CLEAR_STATE - Dropping notifications cache at ${Date.now()}`);
        setNotifications([]);
        setLoading(true);
        setCurrentToast(null);
        setQueue([]);
        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }
    }, []);

    const reinitialize = useCallback(async () => {
        console.log(`[ACCOUNT_FORENSIC] NOTIFICATIONS_REINITIALIZE - Fetching for new account at ${Date.now()}`);
        clearState();
        await Promise.all([
            fetchNotifications(),
            subscribeToPush('REINITIALIZE')
        ]);
        console.log(`[ACCOUNT_FORENSIC] NOTIFICATIONS_READY - Notifications ready at ${Date.now()}`);
    }, [clearState, fetchNotifications, subscribeToPush]);

    return (
        <NotificationContext.Provider value={{ 
            notifications, 
            unreadCount, 
            markAsRead, 
            markAllAsRead, 
            deleteNotification,
            clearAllNotifications,
            loading,
            clearState,
            reinitialize
        }}>
            {children}
            <AnimatePresence>
                {currentToast && (
                    <NotificationToast 
                        key={currentToast.id}
                        notification={currentToast} 
                        onDismiss={dismissCurrent}
                        onClick={() => {
                            if (currentToast.link) {
                                navigate(currentToast.link);
                            }
                            markAsRead(currentToast.id);
                            dismissCurrent();
                        }}
                    />
                )}
            </AnimatePresence>
        </NotificationContext.Provider>
    );
};
