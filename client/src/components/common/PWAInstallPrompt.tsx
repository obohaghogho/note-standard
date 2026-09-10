/**
 * PWAInstallPrompt — NoteStandard
 *
 * Universal Mobile & Desktop PWA Installation Banner & Interactive iOS Guide.
 *
 * Features:
 * 1. Auto-detects Android, iOS (Safari vs Chrome/Firefox), and Desktop.
 * 2. Prominent Header with NoteStandard App Icon and top "Install App" action button.
 * 3. Android: Triggers native beforeinstallprompt dialog directly.
 * 4. iOS:
 *    - Displays exact Safari Share Icon badge [ ↑ ] at the very bottom center of the message.
 *    - Animated bouncing bottom screen pointer pointing directly down to Safari's Share toolbar button.
 *    - Step-by-step visual mockup for Share sheet & "Add to Home Screen".
 *    - Non-Safari detection (Chrome/Firefox on iOS) with 1-tap "Copy Link for Safari".
 * 5. Dismissal persistence with local storage & session state management.
 */

import React, { useEffect, useState } from 'react';
import { X, Download, Share, PlusSquare, Smartphone, CheckCircle2, Sparkles, ChevronRight, ArrowDown, Copy, Check } from 'lucide-react';
import toast from 'react-hot-toast';
import { usePWAInstall, detectPlatform, isInStandaloneMode } from '../../context/PWAInstallContext';

const STORAGE_KEY = 'notestandard_pwa_prompt_dismissed_v3';
const PROMPT_DELAY_MS = 1200; // Fast pop-up when user opens the web app

/** Detects if user is on iOS device */
function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Detects if user is specifically using iOS Safari (which allows PWA installs) */
function isIOSSafari(): boolean {
  if (!isIOSDevice()) return false;
  const ua = navigator.userAgent;
  // Safari on iOS contains "Safari" but NOT Chrome (CriOS), Firefox (FxiOS), Opera (OPiOS), Edge (EdgiOS)
  return /Safari/i.test(ua) && !/CriOS|FxiOS|OPiOS|EdgiOS|mercury/i.test(ua);
}

export const PWAInstallPrompt: React.FC = () => {
  const { isInstalled, installApp } = usePWAInstall();
  const [visible, setVisible] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const isIOS = isIOSDevice();
  const isSafari = isIOSSafari();

  useEffect(() => {
    // 1. Never show if already running in standalone PWA mode or marked installed
    if (isInStandaloneMode() || isInstalled) return;

    // 2. Check dismissal storage (respect dismissal for 24 hours)
    const lastDismissed = localStorage.getItem(STORAGE_KEY);
    if (lastDismissed) {
      const dismissedTime = parseInt(lastDismissed, 10);
      const now = Date.now();
      // If dismissed less than 24 hours ago, don't auto-open
      if (now - dismissedTime < 24 * 60 * 60 * 1000) {
        return;
      }
    }

    // 3. Show popup shortly after page loads
    const timer = setTimeout(() => {
      setVisible(true);
      if (isIOS) {
        setShowIOSGuide(true);
      }
    }, PROMPT_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isInstalled, isIOS]);

  const handleDismiss = (permanent = true) => {
    setVisible(false);
    setDismissed(true);
    setShowIOSGuide(false);
    if (permanent) {
      localStorage.setItem(STORAGE_KEY, Date.now().toString());
    }
  };

  const handleInstallClick = async () => {
    if (isIOS) {
      setShowIOSGuide(true);
    } else {
      await installApp();
    }
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopiedLink(true);
      toast.success('Link copied! Open Safari on your iPhone and paste to install.');
      setTimeout(() => setCopiedLink(false), 3000);
    }
  };

  if (!visible || dismissed || isInstalled) return null;

  const currentPlatform = detectPlatform();

  return (
    <>
      {/* Dimmed Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-md z-[9990] animate-in fade-in duration-300"
        onClick={() => handleDismiss(false)}
      />

      {/* FIXED FLOATING POINTER FOR iOS SAFARI (Points directly down to Safari's Share Icon) */}
      {isIOS && isSafari && showIOSGuide && (
        <div className="fixed bottom-2 inset-x-0 z-[9999] flex flex-col items-center pointer-events-none px-4 animate-in fade-in slide-in-from-bottom-6 duration-500">
          <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-xs sm:text-sm font-bold px-4 py-2.5 rounded-full shadow-2xl border-2 border-white/30 flex items-center gap-2.5 animate-bounce mb-1">
            <span className="p-1 rounded-md bg-white/20">
              <Share size={16} className="text-white" />
            </span>
            <span>Tap this exact Share icon at the bottom of Safari</span>
            <ArrowDown size={18} className="text-yellow-300 animate-pulse" />
          </div>
        </div>
      )}

      {/* Main Pop-up Dialog Modal */}
      <div className="fixed bottom-0 inset-x-0 md:bottom-6 md:right-6 md:left-auto z-[9991] max-w-md w-full p-4 sm:p-6 animate-in slide-in-from-bottom duration-400">
        <div className="bg-gray-900/95 backdrop-blur-xl border border-white/15 rounded-3xl shadow-2xl p-5 sm:p-6 text-white relative overflow-hidden ring-1 ring-blue-500/30">
          
          {/* Subtle Ambient Lighting */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-blue-600/25 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-indigo-600/25 rounded-full blur-3xl pointer-events-none" />

          {/* Top Bar with App Icon, Title, and Close Button */}
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3.5">
              {/* App Logo Icon */}
              <div className="relative">
                <img 
                  src="/icon-192.png" 
                  alt="NoteStandard App Logo" 
                  className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl shadow-xl border border-white/20 object-cover bg-blue-900"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = '/favicon.png';
                  }}
                />
                <span className="absolute -bottom-1 -right-1 bg-emerald-500 w-3.5 h-3.5 rounded-full border-2 border-gray-900" title="Ready to install" />
              </div>

              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-extrabold text-base sm:text-lg text-white leading-tight">
                    Install NoteStandard
                  </h3>
                  <Sparkles size={16} className="text-yellow-400 animate-pulse" />
                </div>
                <p className="text-xs text-blue-400 font-semibold">
                  {isIOS ? 'iPhone / iPad Mobile App' : currentPlatform === 'android' ? 'Android Mobile App' : 'Mobile & Desktop Web App'}
                </p>
              </div>
            </div>

            {/* Close Button */}
            <button
              onClick={() => handleDismiss(true)}
              className="p-2 text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-full transition-all flex-shrink-0"
              aria-label="Close install prompt"
            >
              <X size={18} />
            </button>
          </div>

          {/* PROMINENT TOP INSTALL ACTION BUTTON */}
          <div className="mb-4">
            <button
              onClick={handleInstallClick}
              className="w-full py-3.5 px-5 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-500 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm sm:text-base shadow-lg shadow-blue-600/30 active:scale-[0.98] transition-all flex items-center justify-center gap-2.5 border border-blue-400/30"
            >
              <Download size={20} className="animate-bounce" />
              <span>{isIOS ? 'Install App on iPhone / iPad' : 'Install App Now'}</span>
              <ChevronRight size={18} className="opacity-80" />
            </button>
          </div>

          {/* Non-Safari iOS Warning (Chrome/Firefox on iOS) */}
          {isIOS && !isSafari && (
            <div className="bg-amber-500/15 border border-amber-500/30 p-3.5 rounded-2xl mb-4 text-xs text-amber-200 space-y-2">
              <p className="font-semibold text-amber-300">⚠️ Apple Safari Browser Required:</p>
              <p className="text-[11px] text-amber-200/90 leading-relaxed">
                Apple requires opening this link in standard **Safari** to add NoteStandard to your home screen.
              </p>
              <button
                onClick={handleCopyLink}
                className="w-full py-2 px-3 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 font-bold flex items-center justify-center gap-2 text-xs border border-amber-400/30 transition-all"
              >
                {copiedLink ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                <span>{copiedLink ? 'Link Copied! Open Safari to Paste' : 'Copy Link for Safari'}</span>
              </button>
            </div>
          )}

          {/* STEP-BY-STEP VISUAL INSTALLATION GUIDE FOR iOS */}
          {isIOS && showIOSGuide && isSafari && (
            <div className="mt-3 pt-3 border-t border-white/10 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-blue-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Smartphone size={14} /> Quick 3-Step iOS Guide
                </span>
              </div>

              {/* Step 1: Safari Share Icon Visual Box */}
              <div className="bg-gradient-to-r from-blue-950/60 to-indigo-950/60 border border-blue-500/30 p-3 rounded-2xl flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-blue-600/30 border-2 border-blue-400 text-blue-300 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/20 animate-pulse">
                  <Share size={22} className="text-blue-300" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white text-xs">Step 1: Tap Share Icon</span>
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/30 text-[10px] font-extrabold text-blue-300">Screen Bottom</span>
                  </div>
                  <p className="text-[11px] text-gray-300 leading-snug mt-0.5">
                    Look for the <strong className="text-blue-400 underline">Share box icon</strong> at the bottom center of Safari.
                  </p>
                </div>
              </div>

              {/* Step 2: Add to Home Screen Visual Box */}
              <div className="bg-black/40 border border-white/10 p-3 rounded-2xl flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-indigo-500/20 border border-indigo-400/40 text-indigo-300 flex items-center justify-center shrink-0">
                  <PlusSquare size={22} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-white text-xs">Step 2: Tap "Add to Home Screen"</p>
                  <p className="text-[11px] text-gray-400 leading-snug mt-0.5">
                    Scroll down the popup options list and tap <strong className="text-white">Add to Home Screen</strong>.
                  </p>
                </div>
              </div>

              {/* Step 3: Confirmation Visual Box */}
              <div className="bg-black/40 border border-white/10 p-3 rounded-2xl flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 flex items-center justify-center shrink-0 font-bold text-sm">
                  <CheckCircle2 size={22} />
                </div>
                <div className="flex-1">
                  <p className="font-bold text-white text-xs">Step 3: Tap "Add" at Top Right</p>
                  <p className="text-[11px] text-gray-400 leading-snug mt-0.5">
                    Tap <strong className="text-emerald-400 font-bold">Add</strong> at top right to place NoteStandard on your phone screen!
                  </p>
                </div>
              </div>

              {/* VERY BOTTOM CENTER SHARE ICON IDENTIFIER BADGE */}
              <div className="bg-blue-600/10 border border-blue-500/30 p-3 rounded-2xl text-center flex flex-col items-center justify-center gap-1.5 mt-2">
                <span className="text-[11px] text-gray-300 font-medium">Safari Share Icon look:</span>
                <div className="w-12 h-12 rounded-2xl bg-blue-600/30 border-2 border-blue-400 flex items-center justify-center shadow-lg shadow-blue-500/30 my-0.5 animate-bounce">
                  <Share size={24} className="text-white" />
                </div>
                <div className="flex items-center gap-1 text-xs font-bold text-blue-300">
                  <span>Target Icon at Screen Bottom</span>
                  <ArrowDown size={14} className="animate-pulse" />
                </div>
              </div>
            </div>
          )}

          {/* Footer Action Links */}
          <div className="flex items-center justify-between pt-3 mt-2 border-t border-white/10 text-xs text-gray-400">
            <button 
              onClick={() => handleDismiss(true)} 
              className="hover:text-gray-200 transition-colors py-1 font-medium"
            >
              Not now
            </button>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[11px] text-gray-400">NoteStandard PWA</span>
            </div>
          </div>

        </div>
      </div>
    </>
  );
};
