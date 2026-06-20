const { createClient } = require("@supabase/supabase-js");
const env = require("./env");

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("[SupabaseAdmin] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment");
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

const supabaseAdmin = createClient(
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
);

module.exports = supabaseAdmin;
