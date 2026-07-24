const { createClient } = require("@supabase/supabase-js");
const env = require("./env");

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  const errorMsg = "[SupabaseAdmin] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment";
  if (process.env.NODE_ENV === "production") {
    throw new Error(errorMsg);
  } else {
    console.error(`\x1b[31m%s\x1b[0m`, "❌ " + errorMsg);
  }
}

const http = require('http');
const https = require('https');
const nodeFetch = require('node-fetch');

const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 100 });
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 100 });

const customFetch = (url, options) => {
  return nodeFetch(url, {
    ...options,
    agent: (parsedUrl) => parsedUrl.protocol === 'http:' ? httpAgent : httpsAgent
  });
};

const supabaseAdmin = (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
        global: {
          fetch: customFetch
        }
      },
    )
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
      }),
      auth: {
        admin: {
          createUser: async () => ({ data: { user: null }, error: new Error('Supabase not initialized') }),
          deleteUser: async () => ({ error: new Error('Supabase not initialized') })
        }
      }
    };

module.exports = supabaseAdmin;
