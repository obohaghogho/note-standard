const { createClient } = require("@supabase/supabase-js");
const env = require("./env");

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "⚠️  SUPABASE_SERVICE_ROLE_KEY missing! Admin operations may fail.",
  );
}

const supabaseAdmin = createClient(
  env.SUPABASE_URL || "https://placeholder.supabase.co",
  env.SUPABASE_SERVICE_ROLE_KEY || "placeholder",
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

module.exports = supabaseAdmin;
