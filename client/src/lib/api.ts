// Ensure API_URL is the server root (remove /api suffix if present)
// This fixes double prefix issues (api/api) and socket namespace errors
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/api(\/.*)?\/?$/, '');

export const getAuthHeader = async () => {
    const { supabase } = await import('./supabase');
    const { data } = await supabase.auth.getSession();
    return {
        'Authorization': `Bearer ${data.session?.access_token}`
    };
};
