import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Toaster } from 'react-hot-toast'
import './index.css'
import './i18n'
import App from './App.tsx'

console.log('🚀 NoteStandard Client Version 1.0.2 - Activity & Init Fix');
console.log("ENV CHECK:", import.meta.env);

window.onerror = function(msg, url, line, col, error) {
  const errorMsg = "GLOBAL ERROR: " + msg + "\nAt: " + url + ":" + line + ":" + col;
  console.error(errorMsg);
  // Alert as a last resort to see errors on mobile/production if console is messy
  if (!window.location.hostname.includes('localhost')) {
     alert(errorMsg);
  }
  return false;
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
    <Toaster
      position="top-right"
      toastOptions={{
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
