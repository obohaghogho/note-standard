import React, { createContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { toast } from 'react-hot-toast';
import { API_URL } from '../lib/api';
import { AnimatePresence } from 'framer-motion';
import NotificationToast, { type NotificationToastData } from '../components/common/NotificationToast';
import { useNavigate, useLocation } from 'react-router-dom';

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

            // Auto dismiss after 5s
            dismissTimerRef.current = setTimeout(() => {
                dismissCurrent();
            }, 5000);
        }
    }, [currentToast, queue, dismissCurrent]);

    const isMounted = useRef(true);
    const notificationsFetchRef = useRef(false);
    const pushSubscribeRef = useRef(false);

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
            console.error('[Notifications] Fetch failed:', err);
        } finally {
            if (isMounted.current) setLoading(false);
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

    const subscribeToPush = useCallback(async () => {
        // Rule 7 & 12: Remove profile identity check. Respect isSwitching.
        if (!session || isSwitching || pushSubscribeRef.current) return;
        if (!('serviceWorker' in navigator && 'PushManager' in window)) {
            console.warn('[Notifications] Push NOT supported on this browser');
            return;
        }
        
        pushSubscribeRef.current = true;
        try {
            const registration = await navigator.serviceWorker.ready;
            
            // Check for existing subscription first
            let subscription = await registration.pushManager.getSubscription();
            
            if (!subscription) {
                // Request permission if needed
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    console.warn('[Notifications] Permission denied');
                    return;
                }

                const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
                if (!vapidKey) {
                    console.error('[Notifications] Missing VITE_VAPID_PUBLIC_KEY');
                    return;
                }

                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(vapidKey)
                });
            }

            console.log('[Notifications] Syncing push subscription with backend...');
            await fetch(`${API_URL}/api/notifications/subscribe`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session.access_token}`
                },
                body: JSON.stringify({ subscription })
            });

        } catch (err) {
            console.error('[Notifications] Push subscription failed:', err);
        } finally {
            pushSubscribeRef.current = false;
        }
    }, [session, isSwitching]);

    // Initial Fetch / Identity Switch Reset
    useEffect(() => {
        if (!authReady) return;

        isMounted.current = true;
        
        if (session && user) {
            console.log(`[Notifications] Identity change or initial load detect: ${user.id}`);
            
            // Clear old data to prevent identity leaks
            setNotifications([]);
            setLoading(true);
            
            fetchNotifications();
            subscribeToPush();
        } else if (!session) {
            setNotifications([]);
            setLoading(false);
        }

        return () => { 
            isMounted.current = false; 
        };
    }, [authReady, session, user, fetchNotifications, subscribeToPush]);

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
                    
                    // Reset timer
                    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
                    dismissTimerRef.current = setTimeout(dismissCurrent, 5000);
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

        socket.on('notification', onNotification);
        return () => {
            socket.off('notification', onNotification);
            if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
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

    return (
        <NotificationContext.Provider value={{ 
            notifications, 
            unreadCount, 
            markAsRead, 
            markAllAsRead, 
            deleteNotification,
            clearAllNotifications,
            loading 
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
