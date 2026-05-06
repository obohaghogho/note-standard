import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { toast } from 'react-hot-toast';

export const PushNotificationBanner: React.FC = () => {
    const { permission, isSubscribed, subscribeUser } = usePushNotifications();
    const [dismissed, setDismissed] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        // Only show if we haven't already dismissed it, we have push capability, and we are not subscribed
        const isDismissed = localStorage.getItem('push_banner_dismissed') === 'true';
        if (isDismissed) {
            setDismissed(true);
            return;
        }

        const supportsPush = 'serviceWorker' in navigator && 'PushManager' in window;
        if (!supportsPush) return;

        // On iOS Safari (not installed as PWA), PushManager might exist but subscribing will fail or it's not supported.
        // We will rely on the fact that if it's default/not subscribed, we show it, but only if they haven't explicitly denied it.
        if (permission !== 'denied' && !isSubscribed) {
            // Delay slightly so it doesn't interrupt immediate load
            const timer = setTimeout(() => {
                setVisible(true);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [permission, isSubscribed]);

    if (!visible || dismissed || isSubscribed || permission === 'denied') return null;

    const handleEnable = async () => {
        try {
            await subscribeUser();
            if (Notification.permission === 'granted') {
                toast.success('Push notifications enabled!');
                setVisible(false);
            }
        } catch (err) {
            console.error('Failed to subscribe:', err);
        }
    };

    const handleDismiss = () => {
        setDismissed(true);
        setVisible(false);
        localStorage.setItem('push_banner_dismissed', 'true');
    };

    return (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-3 flex items-center justify-between shadow-md z-50">
            <div className="flex items-center gap-3">
                <div className="bg-white/20 p-2 rounded-lg flex-shrink-0">
                    <Bell className="text-white" size={20} />
                </div>
                <div>
                    <h3 className="text-white font-medium text-sm sm:text-base leading-tight">
                        Enable Push Notifications
                    </h3>
                    <p className="text-blue-100 text-xs sm:text-sm mt-0.5">
                        Never miss a message. Turn on alerts for the best experience.
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <button
                    onClick={handleEnable}
                    className="whitespace-nowrap px-4 py-1.5 bg-white text-blue-600 text-sm font-bold rounded-full shadow-sm hover:bg-blue-50 transition-colors active:scale-95"
                >
                    Enable
                </button>
                <button
                    onClick={handleDismiss}
                    className="text-blue-200 hover:text-white transition-colors"
                    aria-label="Dismiss"
                >
                    <X size={20} />
                </button>
            </div>
        </div>
    );
};
