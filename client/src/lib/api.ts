import { supabase } from './supabase';

// Vite automatically loads the correct .env file based on mode:
//   npm run dev   → .env.development  (VITE_API_URL=http://localhost:5001)
//   npm run build → .env.production   (VITE_API_URL=https://note-standard-api.onrender.com)
export const API_URL = import.meta.env.VITE_API_URL;

if (!API_URL) {
  if (import.meta.env.PROD) {
    console.error('❌ CRITICAL: VITE_API_URL is not defined in production environment!');
  } else {
    console.warn('⚠️  VITE_API_URL is not defined. Using relative paths (Proxy required).');
  }
}


export const getAuthHeader = async () => {
    const { data } = await supabase.auth.getSession();
    return {
        'Authorization': `Bearer ${data.session?.access_token}`
    };
};
