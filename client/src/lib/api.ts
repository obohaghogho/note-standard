import { supabase } from './supabase';

const isProduction = import.meta.env.PROD;

export const API_URL = import.meta.env.VITE_API_URL || 
    (isProduction ? 'https://api.notestandard.com' : 'http://localhost:5000');

export const getAuthHeader = async () => {
    const { data } = await supabase.auth.getSession();
    return {
        'Authorization': `Bearer ${data.session?.access_token}`
    };
};
