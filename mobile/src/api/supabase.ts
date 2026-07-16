import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const SUPABASE_URL = "https://tngcvgisfctggvivcnva.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZ2N2Z2lzZmN0Z2d2aXZjbnZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MTQ3NDEsImV4cCI6MjA4MzE5MDc0MX0.OiAnFRVchVT9k037aipKFrc-zFs2UoYdBrSysMp2LCM";

const ExpoSecureStoreAdapter = {
    getItem: (key: string) => SecureStore.getItemAsync(key),
    setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
    removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
        auth: {
            storage: ExpoSecureStoreAdapter as any,
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: false,
        },
    }
);
