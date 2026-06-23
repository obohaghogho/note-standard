import React, { useState, useEffect } from 'react';
import { X, AlertCircle } from 'lucide-react';

export default function PWAAwarenessBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Only show if the user hasn't dismissed it
    const dismissed = localStorage.getItem('pwa_banner_dismissed');
    if (dismissed) return;

    // Detect if running as iOS PWA
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;

    if (isIos && isStandalone) {
      setIsVisible(true);
    }
  }, []);

  if (!isVisible) return null;

  const handleDismiss = () => {
    localStorage.setItem('pwa_banner_dismissed', 'true');
    setIsVisible(false);
  };

  return (
    <div className="bg-indigo-600/90 backdrop-blur-sm px-4 py-3 text-white sm:px-6 lg:px-8 border-b border-indigo-700">
      <div className="flex flex-wrap items-center justify-between">
        <div className="flex w-0 flex-1 items-center">
          <span className="flex rounded-lg bg-indigo-800 p-2">
            <AlertCircle className="h-5 w-5 text-indigo-100" aria-hidden="true" />
          </span>
          <p className="ml-3 truncate font-medium sm:text-sm text-xs whitespace-normal line-clamp-2">
            <span className="md:hidden">
              For reliable notifications, keep NoteStandard in the background or install the native app.
            </span>
            <span className="hidden md:inline">
              For the most reliable notifications, keep NoteStandard available in the background or install the native app.
            </span>
          </p>
        </div>
        <div className="order-2 flex-shrink-0 sm:order-3 sm:ml-2">
          <button
            type="button"
            onClick={handleDismiss}
            className="-mr-1 flex rounded-md p-2 hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-white"
          >
            <span className="sr-only">Dismiss</span>
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
