import React, { useEffect, useState, useRef } from 'react';
import { APP_VERSION } from '../../version';
import { API_URL } from '../../lib/api';

interface VersionStatus {
  force_update: boolean;
  update_available: boolean;
  update_message: string | null;
  latest_version: string;
  changelog: string[];
}

/** How long (ms) to suppress non-mandatory update prompts after the user clicks Update Now */
const UPDATE_COOLDOWN_MS = 60_000;

// Safe storage access that never throws in private browsing or restricted webviews
function safeGetItem(key: string): string | null {
  try {
    return localStorage.getItem(key) || sessionStorage.getItem(key);
  } catch (_) {
    return null;
  }
}

function safeSetItem(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch (_) {}
  try { sessionStorage.setItem(key, value); } catch (_) {}
}

export const VersionGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<VersionStatus | null>(null);
  const [swWaitingWorker, setSwWaitingWorker] = useState<ServiceWorker | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  // Durable per-version dismissal key
  const dismissedKey = `vg_dismissed_${status?.latest_version || APP_VERSION}`;
  const [dismissed, setDismissed] = useState(() => safeGetItem(dismissedKey) === '1');

  const updateInProgressRef = useRef(false);

  // 1. Listen for Service Worker waiting / updates
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      // Check if a worker is already waiting to activate
      if (reg.waiting) {
        setSwWaitingWorker(reg.waiting);
      }

      // Listen for newly installed workers transitioning to waiting state
      reg.addEventListener('updatefound', () => {
        const installingWorker = reg.installing;
        if (installingWorker) {
          installingWorker.addEventListener('statechange', () => {
            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setSwWaitingWorker(installingWorker);
            }
          });
        }
      });
    }).catch((err) => {
      console.warn('[VersionGuard] SW registration lookup warning:', err);
    });
  }, []);

  // 2. Periodic and visibility-based check with API
  useEffect(() => {
    const checkVersion = async () => {
      // Cooldown check: prevent checking immediately after an update attempt
      const lastAttempt = Number(safeGetItem('vg_update_attempt') || 0);
      if (Date.now() - lastAttempt < UPDATE_COOLDOWN_MS) {
        return;
      }

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`${API_URL}/api/version/check?v=${APP_VERSION}`, {
          signal: controller.signal,
          headers: { 'Cache-Control': 'no-cache' }
        }).finally(() => clearTimeout(timeoutId));

        if (!res.ok) return; // Fail open
        const data: VersionStatus = await res.json();
        setStatus(data);

        // Update dismissal state if target version changed
        if (data.latest_version) {
          const isDismissed = safeGetItem(`vg_dismissed_${data.latest_version}`) === '1';
          setDismissed(isDismissed);
        }
      } catch (err) {
        console.warn('[VersionGuard] Version check non-blocking warning:', err instanceof Error ? err.message : String(err));
      }
    };

    checkVersion();
    const interval = setInterval(checkVersion, 1000 * 60 * 30); // 30 mins

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const handleDismiss = () => {
    const key = `vg_dismissed_${status?.latest_version || APP_VERSION}`;
    safeSetItem(key, '1');
    setDismissed(true);
  };

  const handleUpdate = async () => {
    if (updateInProgressRef.current || isUpdating) return;
    updateInProgressRef.current = true;
    setIsUpdating(true);
    setUpdateError(null);

    // Flag user-initiated update so controllerchange listener permits reload
    (window as any).__pwaUpdateInitiated = true;
    safeSetItem('vg_update_attempt', String(Date.now()));

    try {
      // 1. Activate waiting worker if present
      if (swWaitingWorker) {
        swWaitingWorker.postMessage({ type: 'SKIP_WAITING' });
      } else if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }

      // 2. Clean stale caches without dropping persistent app data
      if ('caches' in window) {
        try {
          const keys = await caches.keys();
          for (const k of keys) {
            if (k.startsWith('old-') || k.startsWith('v-')) {
              await caches.delete(k);
            }
          }
        } catch (_) {}
      }

      // 3. Controlled single reload:
      // Preserves current path, parameters and hash
      let reloaded = false;
      const doReload = () => {
        if (!reloaded) {
          reloaded = true;
          window.location.reload();
        }
      };

      if ('serviceWorker' in navigator) {
        const onController = () => {
          navigator.serviceWorker.removeEventListener('controllerchange', onController);
          doReload();
        };
        navigator.serviceWorker.addEventListener('controllerchange', onController);
        // Fallback timeout in case controllerchange does not fire
        setTimeout(doReload, 800);
      } else {
        setTimeout(doReload, 400);
      }
    } catch (err) {
      console.error('[VersionGuard] Update execution error:', err);
      updateInProgressRef.current = false;
      setIsUpdating(false);
      (window as any).__pwaUpdateInitiated = false;
      setUpdateError('Failed to activate update. Tap to retry.');
    }
  };

  const hasOptionalUpdate = (status?.update_available || Boolean(swWaitingWorker)) && !status?.force_update;

  // Render Mandatory Blocking Modal
  if (status?.force_update) {
    return (
      <div className="fixed inset-0 z-[9999] bg-gray-950 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-900 rounded-3xl p-8 border border-white/10 shadow-2xl text-center">
          <div className="text-6xl mb-6">🚀</div>
          <h1 className="text-2xl font-bold text-white mb-3">Update Required</h1>
          <p className="text-gray-400 mb-6 text-sm leading-relaxed">
            {status.update_message || 'A critical update is available. Please update to continue using NoteStandard.'}
          </p>
          
          {status.changelog && status.changelog.length > 0 && (
            <div className="text-left bg-gray-800/50 rounded-xl p-4 mb-6 border border-white/5">
              <p className="text-xs text-gray-500 uppercase font-bold mb-2">What's New</p>
              <ul className="space-y-1.5">
                {status.changelog.map((item, i) => (
                  <li key={i} className="text-sm text-gray-300 flex items-start gap-2">
                    <span className="text-green-400 mt-0.5">✓</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {updateError && (
            <p className="text-xs text-red-400 mb-4">{updateError}</p>
          )}
          
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 px-6 rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2 cursor-pointer"
          >
            {isUpdating ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                <span>Updating…</span>
              </>
            ) : 'Update Now'}
          </button>
          <p className="text-xs text-gray-600 mt-4">
            Current: v{APP_VERSION} → Latest: v{status.latest_version}
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Soft dismissible update banner */}
      {hasOptionalUpdate && !dismissed && (
        <div
          className="fixed top-0 left-0 right-0 z-[9998] bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-center pb-2.5 px-4 text-sm flex items-center justify-center gap-3 shadow-lg"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.625rem)' }}
        >
          <span>🚀 <strong>v{status?.latest_version || 'New version'}</strong> is available!</span>
          <button 
            onClick={handleUpdate}
            disabled={isUpdating}
            className="bg-white/20 hover:bg-white/30 disabled:opacity-60 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
          >
            {isUpdating ? 'Updating…' : 'Update'}
          </button>
          <button 
            onClick={handleDismiss} 
            className="text-white/60 hover:text-white ml-2 text-lg leading-none cursor-pointer p-1"
            aria-label="Dismiss update notification"
          >
            ×
          </button>
        </div>
      )}
      {children}
    </>
  );
};
