/**
 * IOSInstallPrompt — NoteStandard
 *
 * PURPOSE:
 * On iOS 16.4+, Web Push notifications work — BUT ONLY when the app is
 * installed to the home screen as a PWA. Safari does not support Web Push
 * in the browser tab.
 *
 * This component:
 * 1. Detects iOS users running in the browser (not already installed as PWA)
 * 2. Shows a bottom-sheet prompt explaining how to install the app
 * 3. Only shows once (stored in localStorage) and only on iOS devices
 * 4. Includes step-by-step visual instructions for the Share → Add to Home Screen flow
 *
 * RESULT: iOS users who install the PWA will receive Web Push notifications
 * for all chat messages — no Apple Developer account needed.
 */

import React, { useEffect, useState } from 'react';
import { Share, Plus, X, Bell } from 'lucide-react';

const STORAGE_KEY = 'ios_install_prompt_dismissed';
const PROMPT_DELAY_MS = 8000; // Wait 8s after load — don't interrupt first-time users

/**
 * Detects iOS device running in Safari browser (not as installed PWA)
 */
function isIOSBrowserNotInstalled(): boolean {
    const ua = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    // When installed as PWA, navigator.standalone is true on iOS
    const isStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    // Also check CSS media query (covers some edge cases)
    const isStandaloneCSS = window.matchMedia('(display-mode: standalone)').matches;
    return isIOS && !isStandalone && !isStandaloneCSS;
}

/**
 * Detect iOS version to show appropriate message
 */
function getIOSVersion(): number {
    const match = navigator.userAgent.match(/OS (\d+)_/);
    return match ? parseInt(match[1], 10) : 0;
}

export const IOSInstallPrompt: React.FC = () => {
    const [visible, setVisible] = useState(false);
    const [dismissed, setDismissed] = useState(false);

    useEffect(() => {
        // Don't show if already dismissed in this session or ever
        if (localStorage.getItem(STORAGE_KEY)) return;
        if (!isIOSBrowserNotInstalled()) return;

        // Only show the push notification tip on iOS 16.4+ (where it actually works)
        const iosVersion = getIOSVersion();

        // Delay showing so it doesn't interrupt page load
        const timer = setTimeout(() => {
            setVisible(true);
        }, PROMPT_DELAY_MS);

        return () => clearTimeout(timer);
    }, []);

    const handleDismiss = (permanent = false) => {
        setVisible(false);
        setDismissed(true);
        if (permanent) {
            localStorage.setItem(STORAGE_KEY, '1');
        }
    };

    if (!visible || dismissed) return null;

    const iosVersion = getIOSVersion();
    const supportsPush = iosVersion >= 16;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[200] animate-in fade-in duration-300"
                onClick={() => handleDismiss(false)}
            />

            {/* Bottom Sheet */}
            <div className="fixed bottom-0 inset-x-0 z-[201] animate-in slide-in-from-bottom duration-400 ease-out">
                <div className="bg-gray-900 border-t border-white/10 rounded-t-3xl shadow-2xl px-5 pt-4 pb-safe-or-8 max-w-lg mx-auto">
                    
                    {/* Handle bar */}
                    <div className="w-10 h-1 bg-gray-600 rounded-full mx-auto mb-5" />

                    {/* Close */}
                    <button
                        onClick={() => handleDismiss(true)}
                        className="absolute top-5 right-5 p-2 text-gray-500 hover:text-white rounded-full hover:bg-white/10 transition-all"
                        aria-label="Dismiss"
                    >
                        <X size={20} />
                    </button>

                    {/* Header */}
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg flex-shrink-0">
                            <Bell size={22} className="text-white" />
                        </div>
                        <div>
                            <h3 className="text-white font-bold text-lg leading-tight">
                                {supportsPush ? 'Get message alerts on iOS' : 'Install NoteStandard'}
                            </h3>
                            <p className="text-gray-400 text-sm">
                                {supportsPush
                                    ? 'Add to Home Screen to receive chat notifications'
                                    : 'Add to your Home Screen for the best experience'}
                            </p>
                        </div>
                    </div>

                    {/* Info box */}
                    {supportsPush && (
                        <div className="bg-blue-500/10 border border-blue-500/20 rounded-2xl p-3.5 mb-5">
                            <p className="text-blue-300 text-sm leading-relaxed">
                                📱 <strong>iOS {iosVersion} supports push notifications</strong> for installed apps. Once you add NoteStandard to your Home Screen, you'll receive message alerts even when the app is closed.
                            </p>
                        </div>
                    )}

                    {/* Steps */}
                    <div className="space-y-3 mb-6">
                        <p className="text-gray-400 text-xs font-semibold uppercase tracking-wider">How to install</p>

                        {/* Step 1 */}
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-blue-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0">
                                <Share size={15} className="text-blue-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-white text-sm font-medium">Tap the Share button</p>
                                <p className="text-gray-500 text-xs">
                                    The <Share size={10} className="inline" /> icon at the bottom of Safari
                                </p>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="ml-4 border-l border-gray-700 pl-4 py-0.5">
                            <div className="w-0.5 h-3 bg-gray-700" />
                        </div>

                        {/* Step 2 */}
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-green-500/20 border border-green-500/30 flex items-center justify-center flex-shrink-0">
                                <Plus size={15} className="text-green-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-white text-sm font-medium">Tap "Add to Home Screen"</p>
                                <p className="text-gray-500 text-xs">Scroll down in the share sheet to find it</p>
                            </div>
                        </div>

                        {/* Divider */}
                        <div className="ml-4 border-l border-gray-700 pl-4 py-0.5">
                            <div className="w-0.5 h-3 bg-gray-700" />
                        </div>

                        {/* Step 3 */}
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center flex-shrink-0">
                                <span className="text-purple-400 text-sm">✓</span>
                            </div>
                            <div className="flex-1">
                                <p className="text-white text-sm font-medium">Open from Home Screen</p>
                                <p className="text-gray-500 text-xs">
                                    {supportsPush
                                        ? 'Accept the notification permission when prompted'
                                        : 'Enjoy the full app experience'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex gap-3">
                        <button
                            onClick={() => handleDismiss(true)}
                            className="flex-1 py-3 rounded-2xl border border-gray-700 text-gray-400 font-medium text-sm hover:border-gray-600 hover:text-gray-300 transition-all"
                        >
                            Maybe later
                        </button>
                        <button
                            onClick={() => handleDismiss(false)}
                            className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-semibold text-sm shadow-lg shadow-blue-500/20 active:scale-95 transition-all"
                        >
                            Got it!
                        </button>
                    </div>

                    {/* Footer note */}
                    {!supportsPush && (
                        <p className="text-center text-gray-600 text-xs mt-3">
                            Upgrade to iOS 16.4+ to receive push notifications
                        </p>
                    )}
                </div>
            </div>
        </>
    );
};
