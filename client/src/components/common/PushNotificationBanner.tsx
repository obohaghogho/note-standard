import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { toast } from 'react-hot-toast';

export const PushNotificationBanner: React.FC = () => {
    const { permission, isSubscribed, subscribeUser } = usePushNotifications();
    const [dismissed, setDismissed] = useState(false);
    const [visible, setVisible] = useState(false);

    const isIOS = typeof navigator !== 'undefined' && (
        /iPad|iPhone|iPod/.test(navigator.userAgent) || 
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    );

    const isStandalone = typeof window !== 'undefined' && (
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true
    );

    useEffect(() => {
        const isDismissed = localStorage.getItem('push_banner_dismissed') === 'true';
        if (isDismissed) {
            setDismissed(true);
            return;
        }

        if (permission === 'denied') return;

        // iOS Safari (non-standalone tab): Show PWA guidance banner
        if (isIOS && !isStandalone) {
            const timer = setTimeout(() => setVisible(true), 2000);
            return () => clearTimeout(timer);
        }

        const supportsPush = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
        if (!supportsPush) return;

        const checkAndResetIfRevoked = async () => {
            if (Notification.permission === 'granted') {
                try {
                    const reg = await navigator.serviceWorker.ready;
                    const existingSub = await reg?.pushManager?.getSubscription();
                    if (!existingSub) {
                        console.warn('[PushBanner] Subscription revoked by OS — resetting dismissed flag.');
                        localStorage.removeItem('push_banner_dismissed');
                        setDismissed(false);
                        setTimeout(() => setVisible(true), 2000);
                    }
                } catch (err) {
                    console.warn('[PushBanner] Could not check subscription status:', err);
                }
                return;
            }

            if (!isSubscribed) {
                const timer = setTimeout(() => setVisible(true), 2000);
                return () => clearTimeout(timer);
            }
        };

        checkAndResetIfRevoked();
    }, [permission, isSubscribed, isIOS, isStandalone]);

    if (!visible || dismissed || (isSubscribed && !isIOS) || permission === 'denied') return null;

    const handleEnable = async () => {
        try {
            await subscribeUser();
            if (Notification.permission === 'granted') {
                toast.success('Push notifications enabled!');
                setVisible(false);
            }
        } catch (err: any) {
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
            <div className="flex items-center gap-3 min-w-0">
                <div className="bg-white/20 p-2 rounded-lg flex-shrink-0">
                    <Bell className="text-white" size={20} />
                </div>
                <div className="min-w-0">
                    <h3 className="text-white font-medium text-sm sm:text-base leading-tight">
                        {isIOS && !isStandalone ? "Enable Push Notifications on iPhone" : "Enable Push Notifications"}
                    </h3>
                    <p className="text-blue-100 text-xs sm:text-sm mt-0.5 truncate">
                        {isIOS && !isStandalone 
                            ? "Tap Share 📤 then 'Add to Home Screen' 📱 to enable push alerts." 
                            : "Never miss a message. Turn on alerts for the best experience."}
                    </p>
                </div>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
                <button
                    onClick={handleEnable}
                    className="whitespace-nowrap px-4 py-1.5 bg-white text-blue-600 text-sm font-bold rounded-full shadow-sm hover:bg-blue-50 transition-colors active:scale-95"
                >
                    {isIOS && !isStandalone ? "How to Enable" : "Enable"}
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
