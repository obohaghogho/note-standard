import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase Environment Variables');
}

// Helper to clear potentially corrupt auth storage
export const clearCorruptAuthStorage = () => {
    try {
        // Find and remove all Supabase auth keys from localStorage
        const keysToRemove: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
                keysToRemove.push(key);
            }
        }
        keysToRemove.forEach(key => {
            console.log('Clearing potentially corrupt auth key:', key);
            localStorage.removeItem(key);
        });
        return keysToRemove.length > 0;
    } catch (e) {
        console.error('Error clearing auth storage:', e);
        return false;
    }
};

export const supabase = createClient(supabaseUrl || '', supabaseKey || '', {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true, // Required for password recovery links to work
        storage: window.localStorage,
        flowType: 'implicit' // PKCE causes 500 errors on recovery endpoint
    },
    global: {
        headers: { 'x-application-name': 'note-standard' }
    }
});

console.log('Supabase Client Initialized', {
    url: supabaseUrl,
    hasKey: !!supabaseKey
});
