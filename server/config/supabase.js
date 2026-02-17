const { createClient } = require("@supabase/supabase-js");

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
  console.warn(
    "⚠️  Supabase environment variables missing! Check your .env file.",
  );
}

const supabase = createClient(
  process.env.SUPABASE_URL || "https://placeholder.supabase.co",
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "placeholder",
);

module.exports = supabase;
