const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  const errorMsg = "❌ Supabase environment variables are missing (SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)";
  if (process.env.NODE_ENV === "production") {
    throw new Error(errorMsg);
  } else {
    console.error(`\x1b[31m%s\x1b[0m`, errorMsg);
  }
}

const supabase = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey)
  : { 
      from: () => ({ 
        select: () => ({ 
          order: () => ({ limit: () => ({ data: null, error: null }) }),
          limit: () => ({ data: null, error: null }),
          eq: () => ({ 
            single: () => ({ data: null, error: new Error('Supabase not initialized') }),
            maybeSingle: () => ({ data: null, error: new Error('Supabase not initialized') }) 
          }),
          maybeSingle: () => ({ data: null, error: new Error('Supabase not initialized') })
        }) 
      }) 
    }; 


module.exports = supabase;
