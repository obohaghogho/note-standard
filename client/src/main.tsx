import { StrictMode } from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { Toaster, toast } from 'react-hot-toast'
import App from './App.tsx'
import './index.css'
import './i18n'
import { APP_VERSION } from './version'
import { API_URL } from './lib/api'
import { initKLM } from './lib/KeyboardLayoutManager'
import { initSentry } from './lib/sentry'

// Initialize Sentry Observability
initSentry();

// Initialize Keyboard Layout Manager immediately
initKLM();

// ─── CANONICAL HOST NORMALIZATION ─────────────────────────────────────────────
// Enforce single canonical origin (https://notestandard.com) to prevent cross-origin
// session fragmentations, PWA service worker scope mismatches, and auth token loss.
if (typeof window !== 'undefined' && window.location.hostname === 'www.notestandard.com') {
  try {
    const canonicalTarget = `https://notestandard.com${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (window.top === window.self) {
      window.location.replace(canonicalTarget);
    } else {
      (window.top || window).location.href = canonicalTarget;
    }
  } catch (_) {
    window.location.href = `https://notestandard.com${window.location.pathname}${window.location.search}${window.location.hash}`;
  }
}


// 🚀 SERVICE WORKER REGISTRATION (LIFECYCLE COORDINATED VIA VERSIONGUARD)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('✅ Service Worker registered');

      // Periodic check for SW update (every 60 mins)
      setInterval(() => {
        registration.update().catch(() => {});
      }, 1000 * 60 * 60);
    }).catch((error) => {
      console.error('❌ Service Worker registration failed:', error);
    });

    // Guarded reload: ONLY reload when an update was explicitly triggered by user action
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing && (window as any).__pwaUpdateInitiated) {
        refreshing = true;
        (window as any).__pwaUpdateInitiated = false;
        window.location.reload();
      }
    });
  });
}




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

