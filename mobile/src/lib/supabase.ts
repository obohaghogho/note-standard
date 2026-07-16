import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use the same JWT anon key as api/supabase.ts — the sb_publishable_ format
// breaks Realtime channel subscriptions (useSessionArbitration) and causes
// the ChatProvider to crash silently, leaving conversations state empty.
const supabaseUrl = 'https://tngcvgisfctggvivcnva.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZ2N2Z2lzZmN0Z2d2aXZjbnZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc2MTQ3NDEsImV4cCI6MjA4MzE5MDc0MX0.OiAnFRVchVT9k037aipKFrc-zFs2UoYdBrSysMp2LCM';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
