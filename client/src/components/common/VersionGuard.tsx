import { useEffect, useState } from 'react';
import { APP_VERSION } from '../../version';
import { API_URL } from '../../lib/api';

interface VersionStatus {
  force_update: boolean;
  update_available: boolean;
  update_message: string | null;
  latest_version: string;
  changelog: string[];
}

/** How long (ms) to suppress the update screen after the user clicks Update Now */
const UPDATE_COOLDOWN_MS = 45_000;

/** Clears all SW caches and posts SKIP_WAITING to any waiting worker, then reloads */
async function triggerHardUpdate(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        // Activate the waiting worker so it can serve fresh assets
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
        // Also force the browser to re-fetch sw.js itself
        try { await reg.update(); } catch { /* non-critical */ }
      }
    }
  } catch { /* non-critical */ }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch { /* non-critical */ }

  // Record the attempt so VersionGuard doesn't re-block for 45 s after reload
  sessionStorage.setItem('vg_update_attempt', String(Date.now()));

  // Brief pause lets the new SW take control before reload
  await new Promise((r) => setTimeout(r, 400));
  window.location.reload();
}

/**
 * VersionGuard — checks the server for version compatibility on mount.
 * If force_update is true, renders a blocking update screen.
 * If update_available is true, shows a dismissible banner.
 */
export const VersionGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<VersionStatus | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);

  // Persist dismiss per-version so it survives soft reloads
  const dismissedKey = `vg_dismissed_${APP_VERSION}`;
  const [dismissed, setDismissed] = useState(
    () => sessionStorage.getItem(dismissedKey) === '1'
  );

  const handleDismiss = () => {
    sessionStorage.setItem(dismissedKey, '1');
    setDismissed(true);
  };

  const handleUpdate = async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    await triggerHardUpdate(); // noreturn — page reloads inside
  };

  useEffect(() => {
    const checkVersion = async () => {
      // Suppress the check for UPDATE_COOLDOWN_MS after the user clicked "Update Now".
      // This prevents the blocking screen from reappearing immediately after reload
      // while the new service worker is still activating / caches are still warming.
      const lastAttempt = Number(sessionStorage.getItem('vg_update_attempt') || 0);
      if (Date.now() - lastAttempt < UPDATE_COOLDOWN_MS) {
        console.log('[VersionGuard] Skipping check — update was just triggered.');
        return;
      }

      try {
        const res = await fetch(`${API_URL}/api/version/check?v=${APP_VERSION}`);
        if (!res.ok) return; // Fail open — don't block the app if version check fails
        const data = await res.json();
        console.log('[VersionGuard] Server response:', data);
        setStatus(data);
      } catch (err) {
        console.warn('[VersionGuard] Version check failed (non-blocking):', err);
        // Fail open — let users use the app if the server is unreachable
      }
    };

    checkVersion();
    // Re-check every 30 minutes
    const interval = setInterval(checkVersion, 1000 * 60 * 30);
    return () => clearInterval(interval);
  }, []);

  // Force update screen — blocks all app usage
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
          
          <button
            onClick={handleUpdate}
            disabled={isUpdating}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-3.5 px-6 rounded-xl transition-all active:scale-95 shadow-lg shadow-blue-600/30 flex items-center justify-center gap-2"
          >
            {isUpdating ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Updating…
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
      {/* Soft update banner — dismissible */}
      {status?.update_available && !dismissed && (
        <div className="fixed top-0 left-0 right-0 z-[9998] bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-center py-2.5 px-4 text-sm flex items-center justify-center gap-3 shadow-lg">
          <span>🚀 <strong>v{status.latest_version}</strong> is available!</span>
          <button 
            onClick={handleUpdate}
            disabled={isUpdating}
            className="bg-white/20 hover:bg-white/30 disabled:opacity-60 px-3 py-1 rounded-lg text-xs font-bold transition-all"
          >
            {isUpdating ? 'Updating…' : 'Update'}
          </button>
          <button 
            onClick={handleDismiss} 
            className="text-white/60 hover:text-white ml-2 text-lg leading-none"
          >
            ×
          </button>
        </div>
      )}
      {children}
    </>
  );
};
