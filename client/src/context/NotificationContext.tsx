import React, { createContext, useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './AuthContext';
import { useSocket } from './SocketContext';
import { toast, type Toast } from 'react-hot-toast';
import { API_URL } from '../lib/api';

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
            
            setNotifications(prev => [notification, ...prev]);

            toast.custom((t: Toast) => (
                <div 
                    className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-[#1a1a1a] shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5 border border-white/10 cursor-pointer`}
                    onClick={() => {
                        markAsRead(notification.id);
                        toast.dismiss(t.id);
                    }}
                >
                    <div className="flex-1 w-0 p-4">
                        <div className="flex items-start">
                            <div className="ml-3 flex-1">
                                <p className="text-sm font-medium text-white">{notification.title}</p>
                                <p className="mt-1 text-sm text-gray-400">{notification.message}</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex border-l border-white/10">
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                toast.dismiss(t.id);
                            }}
                            className="w-full border border-transparent rounded-none rounded-r-lg p-4 flex items-center justify-center text-sm font-medium text-primary hover:text-primary/80 focus:outline-none"
                        >
                            Close
                        </button>
                    </div>
                </div>
            ), { duration: 4000 });
        };

        socket.on('notification', onNotification);
        return () => {
            socket.off('notification', onNotification);
        };
    }, [socket, connected, markAsRead]);

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
        </NotificationContext.Provider>
    );
};
