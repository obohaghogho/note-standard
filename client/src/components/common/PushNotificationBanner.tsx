import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { toast } from 'react-hot-toast';

export const PushNotificationBanner: React.FC = () => {
    const { permission, isSubscribed, subscribeUser } = usePushNotifications();
    const [dismissed, setDismissed] = useState(false);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const supportsPush = 'serviceWorker' in navigator && 'PushManager' in window;
        if (!supportsPush) return;
        if (permission === 'denied') return;

        // iOS REVOCATION RECOVERY:
        // After the parallel push fix (sw.js v5), iOS may have already silently revoked
        // push permission due to accumulated silent push penalties from the old code.
        // When this happens, the PushManager subscription is deleted by iOS, but
        // 'push_banner_dismissed' is still 'true' in localStorage, so the banner
        // never re-appeared to let the user re-subscribe.
        //
        // Fix: If the user previously dismissed the banner but no longer has an active
        // subscription, we clear the dismissed flag so the banner re-surfaces and lets
        // them re-enable push. This is a one-time recovery pass.
        const checkAndResetIfRevoked = async () => {
            const isDismissed = localStorage.getItem('push_banner_dismissed') === 'true';

            if (isDismissed && Notification.permission === 'granted') {
                // The user granted permission before — check if subscription still exists
                try {
                    const reg = await navigator.serviceWorker.ready;
                    const existingSub = await reg.pushManager.getSubscription();
                    if (!existingSub) {
                        // Subscription is gone (iOS revoked it). Clear the dismissed flag.
                        console.warn('[PushBanner] Subscription revoked by OS — resetting dismissed flag for re-enrollment.');
                        localStorage.removeItem('push_banner_dismissed');
                        setDismissed(false);
                        // Show the banner after a short delay
                        setTimeout(() => setVisible(true), 3000);
                    } else {
                        // Subscription exists and user dismissed — respect their choice
                        setDismissed(true);
                    }
                } catch (err) {
                    console.warn('[PushBanner] Could not check subscription status:', err);
                    setDismissed(true);
                }
                return;
            }

            if (isDismissed) {
                setDismissed(true);
                return;
            }

            // Normal first-time flow: show banner if not subscribed
            if (!isSubscribed) {
                const timer = setTimeout(() => setVisible(true), 3000);
                return () => clearTimeout(timer);
            }
        };

        checkAndResetIfRevoked();
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
