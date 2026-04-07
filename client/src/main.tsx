import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster, toast } from 'react-hot-toast'
import './index.css'
import './i18n'
import App from './App.tsx'

console.log('🚀 NoteStandard Client Version 1.5.0 - INFRASTRUCTURE RECOVERY');
console.log("ENV CHECK:", import.meta.env.VITE_SUPABASE_URL ? "Supabase Configured" : "Supabase Missing");

// Service Worker Registration with Update Detection
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('SW registered: ', registration);
        
        // Listen for the controllerchange event (reload when new worker takes over)
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!refreshing) {
            refreshing = true;
            window.location.reload();
          }
        });

        const showUpdateToast = (worker: ServiceWorker) => {
          toast.success(
            (t) => (
              <div className="flex flex-col gap-2">
                <span className="font-semibold text-white">New version available!</span>
                <p className="text-xs text-gray-400">Update now to access new features and fixes.</p>
                <button
                  onClick={() => {
                    worker.postMessage({ type: 'SKIP_WAITING' });
                    toast.dismiss(t.id);
                  }}
                  className="mt-2 bg-emerald-500 hover:bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-sm font-bold transition-all shadow-lg shadow-emerald-500/20 uppercase tracking-wide cursor-pointer"
                >
                  🚀 Update Now
                </button>
              </div>
            ),
            {
              duration: Infinity,
              id: 'sw-update-toast',
              style: {
                background: '#1a1a1a',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '16px',
              }
            }
          );
        };

        // Check if there is already a waiting worker (e.g. from a previous load)
        if (registration.waiting) {
          showUpdateToast(registration.waiting);
        }

        // Check for updates being found
        registration.onupdatefound = () => {
          const installingWorker = registration.installing;
          if (installingWorker) {
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                showUpdateToast(installingWorker);
              }
            };
          }
        };
      })
      .catch((registrationError) => {
        console.error('SW registration failed: ', registrationError);
      });
  });
}

window.onerror = function(msg, url, line, col) {
  const errorMsg = "GLOBAL ERROR: " + msg + "\nAt: " + url + ":" + line + ":" + col;
  console.error(errorMsg);
  return false;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 2000,
        style: {
          background: '#1a1a1a',
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.1)',
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: '#fff',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: '#fff',
          },
        },
      }}
    />
  </StrictMode>,
)
