const { createClient } = require("@supabase/supabase-js");
const env = require("./env");

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("[SupabaseAdmin] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
}

const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

module.exports = supabaseAdmin;
