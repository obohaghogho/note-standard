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
}

export const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
    const { session, authReady } = useAuth();
    const { socket, connected } = useSocket();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);

    const isMounted = useRef(true);
    const notificationsFetchRef = useRef(false);
    const pushSubscribeRef = useRef(false);

    const unreadCount = notifications.filter(n => !n.is_read).length;

    const fetchNotifications = useCallback(async () => {
        if (!session || notificationsFetchRef.current) return;
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
            notificationsFetchRef.current = false;
        }
    }, [session?.access_token]);

    const subscribeToPush = useCallback(async () => {
        if (!session || pushSubscribeRef.current) return;
        if (!('serviceWorker' in navigator && 'PushManager' in window)) return;
        
        pushSubscribeRef.current = true;
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            const permission = await Notification.requestPermission();

            if (permission === 'granted') {
                const subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: import.meta.env.VITE_VAPID_PUBLIC_KEY
                });

                await fetch(`${API_URL}/api/notifications/subscribe`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ subscription })
                });
            }
        } catch (err) {
            console.error('[Notifications] Push subscription failed:', err);
        } finally {
            pushSubscribeRef.current = false;
        }
    }, [session?.access_token]);

    // Initial Fetch
    useEffect(() => {
        isMounted.current = true;
        if (authReady) {
            if (session) {
                fetchNotifications();
                subscribeToPush();
            } else {
                setLoading(false);
            }
        }
        return () => { isMounted.current = false; };
    }, [authReady, session?.access_token, fetchNotifications, subscribeToPush]);

    // Socket listeners
    useEffect(() => {
        if (!socket || !connected) return;

        const onNotification = (notification: Notification) => {
            if (!isMounted.current) return;
            
            setNotifications(prev => [notification, ...prev]);

            toast.custom((t: Toast) => (
                <div className={`${t.visible ? 'animate-enter' : 'animate-leave'} max-w-md w-full bg-[#1a1a1a] shadow-lg rounded-lg pointer-events-auto flex ring-1 ring-black ring-opacity-5 border border-white/10`}>
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
                            onClick={() => toast.dismiss(t.id)}
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
    }, [socket, connected]);

    const markAsRead = async (id: string) => {
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
    };

    const markAllAsRead = async () => {
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
    };

    return (
        <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, loading }}>
            {children}
        </NotificationContext.Provider>
    );
};
