import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster, toast } from 'react-hot-toast'
import App from './App.tsx'
import './index.css'
import './i18n'

// 🚀 SERVICE WORKER REGISTRATION & UPDATE DETECTION
if ('serviceWorker' in navigator) {
  // Force update existing registrations immediately
  navigator.serviceWorker.getRegistrations().then(regs => {
    regs.forEach(reg => reg.update());
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').then((registration) => {
      console.log('✅ Service Worker registered');

      // Check for updates on a regular interval
      setInterval(() => {
        registration.update();
      }, 1000 * 60 * 30); // 30 mins

      // Listen for the 'waiting' worker to show update toast
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              // A new service worker is waiting. Show notification.
              toast((t) => (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">🚀</span>
                    <span className="font-bold">New version available!</span>
                  </div>
                  <p className="text-xs text-gray-400">Please update to get the latest features and stability fixes.</p>
                  <button
                    onClick={() => {
                      newWorker.postMessage({ type: 'SKIP_WAITING' });
                      toast.dismiss(t.id);
                    }}
                    className="mt-1 bg-primary text-white text-xs font-bold py-2 px-4 rounded-lg shadow-lg hover:bg-primary/90 transition-all active:scale-95"
                  >
                    Update Now
                  </button>
                </div>
              ), {
                duration: Infinity,
                position: 'bottom-right',
              });
            }
          });
        }
      });
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

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <StrictMode>
      <App />
      <Toaster
        position="top-right"
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
} else {
  console.error('❌ Root container not found!');
}
