import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import './i18n'
import App from './App.tsx'

console.log('🚀 NoteStandard Client Version 1.1.0 - Navigation Stabilization Update');
console.log("ENV CHECK:", import.meta.env);

// Cleanup stale navigation flags on full reload
if (window.performance && window.performance.navigation.type === 1) {
    sessionStorage.removeItem('last_chunk_load_error_reload');
    console.log('[Init] Stale navigation flags cleared');
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
