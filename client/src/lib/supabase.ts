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
        detectSessionInUrl: true, // Allow Supabase to process recovery/signup tokens from URL automatically
        storage: window.localStorage,
        // Disable the BroadcastChannel lock to prevent spurious 5-second timeout
        // warnings in React Strict Mode (dev) and multi-tab environments.
        // Strict Mode unmounts/remounts components which orphans the lock holder,
        // triggering the "Lock was not released within 5000ms" console warning.
        // Our app handles multi-tab session sync via onAuthStateChange instead.
        lock: (name: string, acquireTimeout: number, fn: () => Promise<unknown>) => fn(),
    },
    global: {
        headers: { 'x-application-name': 'note-standard' }
    }
});

console.log('Supabase Client Initialized', {
    url: supabaseUrl,
    hasKey: !!supabaseKey
});
