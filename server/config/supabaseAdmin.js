const { createClient } = require("@supabase/supabase-js");
require("dotenv").config();

if (!process.env.SUPABASE_SERVICE_KEY) {
  console.warn(
    "⚠️  SUPABASE_SERVICE_KEY missing! Admin operations (like analytics) may fail.",
  );
}

// Create a Supabase client with the SERVICE ROLE key to bypass RLS
const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL ||
    "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY || "placeholder",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

module.exports = supabaseAdmin;
