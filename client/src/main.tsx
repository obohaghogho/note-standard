import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import App from './App.tsx'
import './index.css'
import './i18n'

// ☢️ SERVICE WORKER UNLOADER (Emergency Cache Clear)
// If the production site was white/blank, this script will find any old, broken 
// Service Workers and forcibly unregister them to restore the app's visibility.
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const registration of registrations) {
      registration.unregister().then(() => {
        console.warn('🗑️ Cleared stale Service Worker to restore visibility.');
      });
    }
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
