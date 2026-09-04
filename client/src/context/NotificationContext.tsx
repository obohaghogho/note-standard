import React, { createContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { toast } from 'react-hot-toast';
import { API_URL } from '../lib/api';
import { AnimatePresence } from 'framer-motion';
import NotificationToast, { type NotificationToastData } from '../components/common/NotificationToast';
import { useNavigate, useLocation } from 'react-router-dom';
import { getDeviceId, getDeviceMetadata } from '../utils/deviceId';
import { Bell } from 'lucide-react';
import { resolveNotificationLink } from '../utils/notificationUtils';
import { accountManager } from '../utils/accountManager';

interface Notification {
    id: string;
    receiver_id: string;
    sender_id?: string;
    type: string;
    title: string;
    message?: string;
    link?: string;
    conversationId?: string;
    is_read: boolean;
    created_at: string;
    sender?: {
        username: string;
        avatar_url?: string;
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
    subscribeToPush: (reason?: string) => Promise<void>;
    requestPushPermission: () => Promise<boolean>;
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
    const currentToastRef = useRef<NotificationToastData | null>(null);
    const queueRef = useRef<NotificationToastData[]>([]);
    const isInteractingRef = useRef<boolean>(false);

    useEffect(() => { currentToastRef.current = currentToast; }, [currentToast]);
    useEffect(() => { queueRef.current = queue; }, [queue]);

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
            
            // Set a new 5s timer ONLY if user is not actively typing/replying
            if (!isInteractingRef.current) {
                dismissTimerRef.current = setTimeout(() => {
                    dismissCurrent();
                }, 5000);
            }
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
            console.warn(`[PushRecovery][${reason}] ⚠️ Service Worker not ready immediately — scheduling async callback on ready.`);
            navigator.serviceWorker.ready.then(() => {
                _doSubscribe(`${reason}_SW_ASYNC`);
            }).catch(() => {});
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

            // CRITICAL: Only call requestPermission() when triggered by an explicit user gesture.
            // Auto-recovery paths (AUTH_CHANGE, VISIBILITY_CHANGE, WINDOW_FOCUS, PERIODIC_6H,
            // REINITIALIZE) run in the background without a user gesture. Calling requestPermission()
            // from these paths causes browsers to silently auto-deny the prompt, which permanently
            // blocks notifications for the user on new devices.
            const isUserGestureReason = reason === 'MANUAL' || reason === 'MANUAL_USER_GESTURE';

            if (perm === 'default' && isUserGestureReason) {
                console.log(`[PushRecovery][${reason}] Requesting browser notification permission...`);
                try {
                    perm = await Notification.requestPermission();
                } catch (permErr) {
                    console.warn(`[PushRecovery][${reason}] requestPermission error:`, permErr);
                }
            }

            if (perm !== 'granted') {
                console.log(`[PushRecovery][${reason}] Permission state: ${perm}${!isUserGestureReason && perm === 'default' ? ' (skipping prompt — not a user gesture)' : ''}. Cannot subscribe.`);
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

        const subJson = subscription.toJSON ? subscription.toJSON() : subscription;
        const p256dh = subJson?.keys?.p256dh || null;
        const auth = subJson?.keys?.auth || null;

        try {
            const subRes = await fetch(`${API_URL}/api/notifications/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({
                    subscription: subJson,
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

        // ── Step 4b: Sync V2 installation tables ─────────────────────────────────
        // CRITICAL FIX (Bug 6): The V2 push routing system reads from device_installations
        // and installation_accounts tables. If only push_subscriptions is updated (V1),
        // the V2 router sees a stale/INVALID endpoint and sends to the wrong target.
        // Every subscription recovery MUST also update the V2 tables.
        if (p256dh && auth && deviceId) {
            try {
                const instRes = await fetch(`${API_URL}/api/notifications/register-installation`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({
                        deviceId,
                        pushEndpoint: subscription.endpoint,
                        pushP256dh: p256dh,
                        pushAuth: auth,
                        platform: platform || 'web',
                        type: 'vapid',
                        reason: `PUSH_RECOVERY_${reason}`,
                        capabilities: {
                            supports_web_push: true,
                            supports_fcm: false,
                            supports_apns: false,
                            supports_background_sync: true
                        }
                    })
                });
                console.log(`[PushRecovery][${reason}] Backend /register-installation (V2 sync) → HTTP ${instRes.status}`);
            } catch (err) {
                console.warn(`[PushRecovery][${reason}] /register-installation non-fatal warning:`, err instanceof Error ? err.message : String(err));
            }
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

    // ─── Boot Self-Healing Push Audit ──────────────────────────────────────────
    // Detects stranded accounts (0 push tokens registered on server) and auto-syncs.
    useEffect(() => {
        if (!session || !user || typeof window === 'undefined' || !('Notification' in window)) return;
        if (Notification.permission !== 'granted') return;

        const runBootSelfHeal = async () => {
            try {
                const deviceId = await getDeviceId();
                const res = await fetch(`${API_URL}/api/notifications/installation-status/${deviceId}`, {
                    headers: { 'Authorization': `Bearer ${session.access_token}` }
                });
                if (res.ok) {
                    const data = await res.json();
                    if (!data.registered || data.status === 'UNKNOWN') {
                        console.log('[PushSelfHeal] Device not registered on server — auto-syncing push tokens...');
                        await subscribeToPush('BOOT_SELF_HEAL');
                    }
                }
            } catch (err) {
                console.warn('[PushSelfHeal] Non-fatal boot check note:', err);
            }
        };

        const timer = setTimeout(runBootSelfHeal, 3000);
        return () => clearTimeout(timer);
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
                    let notifConversationId: string | null = notification.conversationId || (notification as any).conversation_id || null;
                    if (!notifConversationId && notification.link) {
                        try {
                            const linkUrl = new URL(notification.link, window.location.origin);
                            notifConversationId = linkUrl.searchParams.get('id') || linkUrl.searchParams.get('conversationId');
                        } catch {
                            // If parsing fails, fall back to string extraction
                            const match = notification.link.match(/[?&](id|conversationId)=([^&]+)/);
                            notifConversationId = match ? match[2] : null;
                        }
                    }

                    // Extract the currently active conversation ID from the browser URL
                    const currentParams = new URLSearchParams(location.search);
                    const activeConversationId = currentParams.get('id') || currentParams.get('conversationId');

                    // If user is already looking at this exact conversation → fully suppress the toast
                    // AND mark it as read immediately so no badge accumulates
                    if (notifConversationId && activeConversationId && notifConversationId === activeConversationId) {
                        console.log('[Notifications] Suppressing chat notification — user is already in this conversation:', notifConversationId);
                        // Silently mark as read on the server (fire-and-forget)
                        markAsRead(notification.id);
                        // Still add to list (silently marked read) so history is intact
                        setNotifications(prev => prev.some(n => n.id === notification.id) ? prev : [{ ...notification, is_read: true }, ...prev]);
                        return;
                    }

                    // User is on the chat page but in a DIFFERENT conversation → show the toast
                    console.log('[Notifications] Showing chat notification — user is in a different conversation');
                }
            }

            setNotifications(prev => prev.some(n => n.id === notification.id) ? prev : [notification, ...prev]);

            const resolvedLink = resolveNotificationLink({
                type: notification.type,
                link: notification.link,
                conversationId: notification.conversationId || (notification as any).conversation_id,
                userRole: user?.role
            });

            let notifConvId: string | undefined = notification.conversationId || (notification as any).conversation_id;
            if (!notifConvId && notification.link) {
                try {
                    const linkUrl = new URL(notification.link, window.location.origin);
                    notifConvId = linkUrl.searchParams.get('id') || linkUrl.searchParams.get('conversationId') || undefined;
                } catch {
                    const match = notification.link.match(/[?&](?:id|conversationId)=([^&]+)/);
                    if (match) notifConvId = match[1];
                }
            }

            const toastData: NotificationToastData = {
                id: notification.id,
                title: notification.title,
                message: notification.message,
                type: notification.type,
                link: resolvedLink,
                conversationId: notifConvId,
                targetAccountId: notification.receiver_id || (notification as any).user_id || (notification as any).targetAccountId,
                sender: notification.sender,
                count: 1
            };

            // Grouping logic for messages: update active toast or queued item in-place
            if (notification.type === 'chat_message' || notification.type === 'message') {
                const cur = currentToastRef.current;
                const isCurrentMatch = !!cur && (
                    (cur.conversationId && notifConvId && cur.conversationId === notifConvId) ||
                    (cur.sender?.username && notification.sender?.username && cur.sender.username === notification.sender.username) ||
                    (cur.title && notification.title && cur.title === notification.title)
                );

                if (isCurrentMatch && cur) {
                    console.log('[Notifications] Updating active toast notification in-place for:', cur.title || notifConvId);
                    const updatedToast: NotificationToastData = {
                        ...cur,
                        id: notification.id,
                        message: notification.message,
                        count: (cur.count || 1) + 1,
                        conversationId: cur.conversationId || notifConvId,
                        sender: notification.sender || cur.sender
                    };
                    setCurrentToast(updatedToast);

                    // Reset auto-dismiss timer so user has full 5s to view updated notification
                    if (!isInteractingRef.current) {
                        if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
                        dismissTimerRef.current = setTimeout(() => {
                            dismissCurrent();
                        }, 5000);
                    }
                    return;
                }

                const qList = queueRef.current;
                const queueIndex = qList.findIndex(q => 
                    (q.conversationId && notifConvId && q.conversationId === notifConvId) ||
                    (q.sender?.username && notification.sender?.username && q.sender.username === notification.sender.username) ||
                    (q.title && notification.title && q.title === notification.title)
                );

                if (queueIndex !== -1) {
                    console.log('[Notifications] Updating queued toast notification in-place for:', qList[queueIndex].title || notifConvId);
                    setQueue(prev => {
                        const newQueue = [...prev];
                        newQueue[queueIndex] = {
                            ...newQueue[queueIndex],
                            id: notification.id,
                            message: notification.message,
                            count: (newQueue[queueIndex].count || 1) + 1,
                            conversationId: newQueue[queueIndex].conversationId || notifConvId,
                            sender: notification.sender || newQueue[queueIndex].sender
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
    }, [socket, connected, markAsRead, dismissCurrent, location.pathname, location.search]);

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

    const requestPushPermission = useCallback(async (): Promise<boolean> => {
        if (!('Notification' in window)) return false;
        // Guard: if already denied, don't attempt — just inform the user.
        if (Notification.permission === 'denied') {
            toast.error('Notifications are blocked. Click the 🔒 lock icon in your address bar → Notifications → Allow, then reload.');
            return false;
        }
        try {
            // This is the single authoritative call to requestPermission().
            // It MUST be called from a user gesture (button click).
            // All background paths in _doSubscribe guard against calling it.
            const perm = await Notification.requestPermission();
            if (perm === 'granted') {
                // Permission is now 'granted'; _doSubscribe will skip the prompt
                await subscribeToPush('MANUAL_USER_GESTURE');
                toast.success('Push notifications enabled!');
                return true;
            } else if (perm === 'denied') {
                toast.error('Notifications blocked. To enable: click the 🔒 lock icon in your address bar → Notifications → Allow, then reload the page.');
            }
        } catch (e) {
            console.error('[Notifications] Permission request error:', e);
        }
        return false;
    }, [subscribeToPush]);

    const [showPermissionBanner, setShowPermissionBanner] = useState(false);

    useEffect(() => {
        if (user && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
            const timer = setTimeout(() => setShowPermissionBanner(true), 2000);
            return () => clearTimeout(timer);
        } else {
            setShowPermissionBanner(false);
        }
    }, [user]);

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
            reinitialize,
            subscribeToPush,
            requestPushPermission
        }}>
            {children}
            {showPermissionBanner && (
                <div className="fixed bottom-20 left-3 right-3 sm:left-auto sm:right-5 sm:max-w-sm sm:bottom-4 z-50 bg-gray-950/95 backdrop-blur-xl border border-blue-500/30 p-4 rounded-2xl shadow-2xl flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-5 duration-300">
                    <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 text-blue-400 font-semibold text-sm">
                            <Bell size={18} />
                            <span>Enable Notifications</span>
                        </div>
                        <button 
                            type="button"
                            onClick={() => setShowPermissionBanner(false)}
                            className="text-gray-400 hover:text-white text-xs p-1 rounded-lg hover:bg-white/10 transition-all cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>
                    <p className="text-xs text-gray-300 leading-snug">
                        Get instant alerts for new chat requests, messages, and security updates on your device.
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                        <button
                            type="button"
                            onClick={async () => {
                                const ok = await requestPushPermission();
                                if (ok) setShowPermissionBanner(false);
                            }}
                            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-600/30 transition-all active:scale-95 text-center min-h-[38px] flex items-center justify-center cursor-pointer"
                        >
                            Enable Now
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowPermissionBanner(false)}
                            className="py-2.5 px-3 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-medium rounded-xl transition-all cursor-pointer"
                        >
                            Later
                        </button>
                    </div>
                </div>
            )}
            <AnimatePresence>
                {currentToast && (
                    <NotificationToast 
                        key={currentToast.conversationId || currentToast.sender?.username || currentToast.title || currentToast.id}
                        notification={currentToast} 
                        onDismiss={dismissCurrent}
                        onInteractChange={(isInteracting) => {
                            isInteractingRef.current = isInteracting;
                            if (isInteracting) {
                                if (dismissTimerRef.current) {
                                    clearTimeout(dismissTimerRef.current);
                                    dismissTimerRef.current = null;
                                }
                            } else if (currentToastRef.current) {
                                if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
                                dismissTimerRef.current = setTimeout(() => {
                                    dismissCurrent();
                                }, 5000);
                            }
                        }}
                        onQuickReply={async (convId: string, text: string, targetAccountId?: string) => {
                            let token = session?.access_token;
                            if (targetAccountId && targetAccountId !== user?.id) {
                                const storedAccount = accountManager.getAccount(targetAccountId);
                                const storedTokens = storedAccount?.tokens || storedAccount?.session;
                                if (storedTokens?.access_token) {
                                    token = storedTokens.access_token;
                                    console.log(`[NotificationContext] Using token for target account ${targetAccountId} for quick reply`);
                                } else {
                                    console.warn(`[NotificationContext] Target account ${targetAccountId} token not found in accountManager, falling back to active session`);
                                }
                            }

                            if (!token) return;

                            const res = await fetch(`${API_URL}/api/chat/conversations/${convId}/messages`, {
                                method: 'POST',
                                headers: {
                                    'Content-Type': 'application/json',
                                    'Authorization': `Bearer ${token}`
                                },
                                body: JSON.stringify({
                                    content: text,
                                    type: 'text'
                                })
                            });
                            if (!res.ok) {
                                throw new Error('Failed to send quick reply');
                            }
                            const data = await res.json();

                            // Broadcast QUICK_REPLY_SUBMITTED so ChatContext (and any active window/tab) updates state immediately
                            window.postMessage({
                                type: 'QUICK_REPLY_SUBMITTED',
                                conversationId: convId,
                                message: data
                            }, '*');
                        }}
                        onClick={() => {
                            const targetLink = resolveNotificationLink({
                                type: currentToast.type,
                                link: currentToast.link,
                                conversationId: currentToast.conversationId || (currentToast as any).conversationId || (currentToast as any).conversation_id,
                                userRole: user?.role
                            });
                            if (targetLink) {
                                if (targetLink.includes('openSupport=true')) {
                                    window.dispatchEvent(new CustomEvent('open-support-chat'));
                                }
                                navigate(targetLink);
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
