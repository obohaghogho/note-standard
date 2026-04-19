import { supabase } from './supabase';

// Vite automatically loads the correct .env file based on mode:
//   npm run dev   → .env.development  (VITE_API_URL=https://note-standard-api.onrender.com)
//   npm run build → .env.production   (VITE_API_URL=https://note-standard-api.onrender.com)
export const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? 'https://note-standard-api.onrender.com' : 'https://note-standard-api.onrender.com');

if (!API_URL) {
  if (import.meta.env.PROD) {
    console.error('❌ CRITICAL: VITE_API_URL is not defined in production environment!');
  } else {
    console.warn('⚠️  VITE_API_URL is not defined. Using relative paths (Proxy required).');
  }
}


export const getAuthHeader = async () => {
    try {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        
        if (!token) {
            return {}; // No token available
        }
        
        return {
            'Authorization': `Bearer ${token}`
        };
    } catch (err) {
        console.error('[API] Failed to get session:', err);
        return {};
    }
};
