// Ensure API_URL is the server root (remove /api suffix if present)
// This fixes double prefix issues (api/api) and socket namespace errors
const isProduction = typeof window !== 'undefined' && 
                     window.location.hostname !== 'localhost' && 
                     !window.location.hostname.includes('127.0.0.1');

export const API_URL = import.meta.env.VITE_API_URL || 
    (isProduction 
        ? (window.location.hostname.includes('notestandard.com') ? 'https://api.notestandard.com' : '') 
        : 'http://localhost:5000').replace(/\/$/, '');

export const getAuthHeader = async () => {
    const { supabase } = await import('./supabase');
    const { data } = await supabase.auth.getSession();
    return {
        'Authorization': `Bearer ${data.session?.access_token}`
    };
};
