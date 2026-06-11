import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { Toaster, toast } from 'react-hot-toast'
import App from './App.tsx'
import './index.css'
import './i18n'
import { APP_VERSION } from './version'
import { API_URL } from './lib/api'

// 🚀 SERVICE WORKER REGISTRATION & UPDATE DETECTION
if ('serviceWorker' in navigator) {
  // Force update existing registrations immediately
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.update());
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('✅ Service Worker registered');

      // Check for updates on a regular interval (via SW fallback)
      setInterval(() => {
        registration.update().catch(() => {});
      }, 1000 * 60 * 30); // 30 mins

      const showUpdateNotification = (newWorker?: ServiceWorker) => {
        toast((t) => (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xl">🚀</span>
              <span className="font-bold">New version available!</span>
            </div>
            <p className="text-xs text-gray-400">Please update to get the latest features and stability fixes.</p>
            <button
              onClick={async () => {
                // Stamp the attempt so VersionGuard + checkForAppUpdate skip
                // re-triggering for 45 s after this reload.
                sessionStorage.setItem('vg_update_attempt', String(Date.now()));
                toast.dismiss(t.id);

                if (newWorker) {
                  // SW path: tell the waiting worker to activate, then reload.
                  // controllerchange listener below handles the actual reload.
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                } else {
                  // API-only path: activate any waiting SW, clear caches, reload.
                  try {
                    if ('serviceWorker' in navigator) {
                      const regs = await navigator.serviceWorker.getRegistrations();
                      for (const reg of regs) {
                        if (reg.waiting) reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                        try { await reg.update(); } catch { /* non-critical */ }
                      }
                    }
                  } catch { /* non-critical */ }

                  try {
                    const keys = await caches.keys();
                    await Promise.all(keys.map((k) => caches.delete(k)));
                  } catch { /* non-critical */ }

                  setTimeout(() => window.location.reload(), 400);
                }
              }}
              className="mt-1 bg-primary text-white text-xs font-bold py-2 px-4 rounded-lg shadow-lg hover:bg-primary/90 transition-all active:scale-95"
            >
              Update Now
            </button>
          </div>
        ), {
          duration: Infinity,
          position: 'top-center', // better visibility
          id: 'pwa-update-toast' // prevent duplicates
        });
      };

      // 1. If there's ALREADY a waiting worker mapped when the user logs in/boots:
      if (registration.waiting) {
        showUpdateNotification(registration.waiting);
      }

      // 2. Listen for NEW updates arriving during the session via SW:
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateNotification(newWorker);
            }
          });
        }
      });

      // 3. DETERMINISTIC BACKGROUND VERSION CHECK via API
      const checkForAppUpdate = async () => {
          // Don't re-show the toast for 45 s after the user clicked "Update Now".
          // This prevents the update prompt from reappearing immediately while the
          // new service worker is still activating and the new bundle is loading.
          const lastAttempt = Number(sessionStorage.getItem('vg_update_attempt') || 0);
          if (Date.now() - lastAttempt < 45_000) return;

          try {
              const res = await fetch(`${API_URL}/api/version/check?v=${APP_VERSION}`);
              if (!res.ok) return;
              
              const data = await res.json();
              
              // If the server explicitly says we need an update based on our known APP_VERSION
              if (data.force_update || data.update_available) {
                  showUpdateNotification();
              }
          } catch (err) {
              console.log('[UpdateCheck] API check failed:', err);
          }
      };

      // Execute deterministic check on boot & every 5 mins
      setTimeout(checkForAppUpdate, 3000);
      setInterval(checkForAppUpdate, 1000 * 60 * 5);

    }).catch((error) => {
      console.error('❌ Service Worker registration failed:', error);
    });

    // Reload the page when the new service worker takes control
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  });
}

console.log('🚀 NoteStandard Booting...');

// ── Production-grade cross-platform keyboard tracker ────────────────────────
// Handles both iOS Safari and Android Chrome keyboard viewports.
// We strictly emit --kb-height so the CSS can hardware-accelerate the translation.
(() => {
  const applyViewportVars = () => {
    const vp = window.visualViewport;
    if (vp) {
      // --vv-top: how far the visual viewport top is from the layout viewport top
      // (used for top-down absolute positioning of the composer)
      const vvTop = vp.offsetTop;
      const vvHeight = vp.height;
      document.documentElement.style.setProperty('--vv-top', `${vvTop}px`);
      document.documentElement.style.setProperty('--vv-height', `${vvHeight}px`);

      // --kb-height: how much of the layout viewport is obscured by the keyboard
      // If the OS shrank the layout viewport (PWA mode), this evaluates to 0, preventing double offset.
      const kbHeight = Math.max(0, window.innerHeight - (vvHeight + vvTop));
      document.documentElement.style.setProperty('--kb-height', `${kbHeight}px`);
      if (kbHeight > 60) {
        document.documentElement.classList.add('keyboard-open');
      } else {
        document.documentElement.classList.remove('keyboard-open');
      }
    } else {
      document.documentElement.style.setProperty('--vv-top', '0px');
      document.documentElement.style.setProperty('--vv-height', `${window.innerHeight}px`);
      document.documentElement.style.setProperty('--kb-height', '0px');
      document.documentElement.classList.remove('keyboard-open');
    }
  };

  // Apply immediately (no rAF) so there is zero frame delay
  const setViewportVarsSync = () => applyViewportVars();

  // For non-keyboard resizes (rotation etc.) rAF is fine
  let rafId: number | null = null;
  const setViewportVarsRaf = () => {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(() => { applyViewportVars(); rafId = null; });
  };

  // Run immediately on load.
  applyViewportVars();

  // VisualViewport API — fires every frame during keyboard animation
  if (window.visualViewport) {
    // SYNC (no rAF): fires every pixel the keyboard moves, giving frame-perfect tracking
    window.visualViewport.addEventListener('resize', setViewportVarsSync, { passive: true });
    window.visualViewport.addEventListener('scroll', setViewportVarsSync, { passive: true });
  }

  // Orientation/desktop resize — rAF is fine here
  window.addEventListener('resize', setViewportVarsRaf, { passive: true });

  // Chrome 94+ Virtual Keyboard API.
  // IMPORTANT: Do NOT set overlaysContent = true here.
  // overlaysContent=true tells Chrome not to shrink the visual viewport when the keyboard opens.
  // Our container strategy (.chat-root tracks --vv-height) REQUIRES the visual viewport to shrink.
  // Without shrinking, --vv-height stays at full screen height and the composer lands behind the keyboard.
  // The visualViewport 'resize' listener above already handles everything we need.
  if ('virtualKeyboard' in navigator) {
    // Fallback: also toggle keyboard-open class via geometrychange for browsers
    // where visualViewport.resize doesn't fire reliably.
    (navigator as unknown as { virtualKeyboard: { addEventListener: (type: string, listener: (e: { target: { boundingRect: { height: number } } }) => void) => void } }).virtualKeyboard.addEventListener('geometrychange', (event: { target: { boundingRect: { height: number } } }) => {
      const { height } = event.target.boundingRect;
      if (height > 60) {
        document.documentElement.classList.add('keyboard-open');
      } else {
        document.documentElement.classList.remove('keyboard-open');
      }
    });
  }

  // Prevent ANY document-level scrolling on focus and generally lock document scroll to 0,0.
  const forceScrollReset = () => {
    if (window.scrollY !== 0 || window.scrollX !== 0) {
      window.scrollTo(0, 0);
    }
  };

  document.addEventListener('focusin', (e) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') {
      forceScrollReset();
      // Apply viewport immediately on focus so the layout is ready before the keyboard animates
      applyViewportVars();
    }
  }, { passive: true });

  window.addEventListener('scroll', forceScrollReset, { passive: true });
})();


const container = document.getElementById('root');
if (container) {
  const appElement = (
    <StrictMode>
      <App />
      <Toaster
        position="bottom-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: '#1a1a1a',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.1)',
          },
        }}
      />
    </StrictMode>
  );

  if (container.hasChildNodes()) {
    hydrateRoot(container, appElement);
  } else {
    const root = createRoot(container);
    root.render(appElement);
  }
} else {
  console.error('❌ Root container not found!');
}

