import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import './i18n'
import App from './App.tsx'

console.log('🚀 NoteStandard Client Version 1.4.1 - GOLD MASTER STABLE');
console.log("ENV CHECK:", import.meta.env.VITE_SUPABASE_URL ? "Supabase Configured" : "Supabase Missing");

// Nuclear Cache Purge: Kills all stale production caches including Service Workers
(function() {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const registration of registrations) {
                registration.unregister();
                console.log('[PURGE] Service Worker Unregistered');
            }
        });
    }
    
    // Clear browser caches
    if (window.caches) {
        caches.keys().then((names) => {
            for (const name of names) caches.delete(name);
            console.log('[PURGE] Browser Cache Storage Cleared');
        });
    }

    // Standard Cleanup
    sessionStorage.removeItem('last_chunk_load_error_reload');
    console.log('[Init] App State Normalized');
})();

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
