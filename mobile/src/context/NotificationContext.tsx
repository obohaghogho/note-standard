import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import NotificationToast, { NotificationData } from '../components/NotificationToast';
import EventEmitter from '../services/EventEmitter';

interface NotificationContextValue {
    showNotification: (notification: Omit<NotificationData, 'id'>) => void;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentNotification, setCurrentNotification] = useState<NotificationData | null>(null);
    const [queue, setQueue] = useState<NotificationData[]>([]);
    const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);

    const dismissCurrent = useCallback(() => {
        if (dismissTimerRef.current) {
            clearTimeout(dismissTimerRef.current);
            dismissTimerRef.current = null;
        }
        setCurrentNotification(null);
    }, []);

    useEffect(() => {
        const handler = (data: any) => showNotification(data);
        EventEmitter.on('notification', handler);
        return () => EventEmitter.off('notification', handler);
    }, [showNotification]);

    useEffect(() => {
        if (!currentNotification && queue.length > 0) {
            const next = queue[0];
            setQueue(prev => prev.slice(1));
            setCurrentNotification(next);

            dismissTimerRef.current = setTimeout(() => {
                dismissCurrent();
            }, 5000);
        }
    }, [currentNotification, queue, dismissCurrent]);

    const showNotification = useCallback((data: Omit<NotificationData, 'id'>) => {
        const id = Math.random().toString(36).substring(7);
        const newNotification = { ...data, id };

        // Grouping logic
        if (data.type === 'message' || data.type === 'chat_message') {
            // Check current
            if (currentNotification && currentNotification.title === data.title) {
                setCurrentNotification(prev => prev ? {
                    ...prev,
                    message: data.message,
                    count: (prev.count || 1) + 1
                } : null);
                
                if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
                dismissTimerRef.current = setTimeout(dismissCurrent, 5000);
                return;
            }

            // Check queue
            const queueIndex = queue.findIndex(q => q.title === data.title);
            if (queueIndex !== -1) {
                setQueue(prev => {
                    const newQueue = [...prev];
                    newQueue[queueIndex] = {
                        ...newQueue[queueIndex],
                        message: data.message,
                        count: (newQueue[queueIndex].count || 1) + 1
                    };
                    return newQueue;
                });
                return;
            }
        }

        setQueue(prev => [...prev, newNotification]);
    }, [currentNotification, queue, dismissCurrent]);

    return (
        <NotificationContext.Provider value={{ showNotification }}>
            {children}
            {currentNotification && (
                <NotificationToast 
                    key={currentNotification.id}
                    notification={currentNotification}
                    onDismiss={dismissCurrent}
                    onClick={() => {
                        console.log('[Notification] Clicked:', currentNotification.id);
                        dismissCurrent();
                    }}
                />
            )}
        </NotificationContext.Provider>
    );
};

export const useNotifications = () => {
    const context = useContext(NotificationContext);
    if (!context) {
        throw new Error('useNotifications must be used within NotificationProvider');
    }
    return context;
};
