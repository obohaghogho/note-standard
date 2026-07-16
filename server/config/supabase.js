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

// FIX: TCP Ephemeral Port Exhaustion
// We must inject an HTTP keep-alive agent into Supabase's cross-fetch.
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

// Robust Proxy-based chainable mock database for standalone/CI execution
const makeMockBuilder = () => {
  const builder = {
    then: (resolve) => resolve({ data: [], error: null }),
    catch: () => builder,
  };
  return new Proxy(builder, {
    get: (target, prop) => {
      if (prop === 'then') {
        return target.then;
      }
      return () => makeMockBuilder();
    }
  });
};

const supabase = (supabaseUrl && supabaseServiceKey) 
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      },
      global: {
        fetch: customFetch
      }
    })
  : makeMockBuilder(); 

module.exports = supabase;
