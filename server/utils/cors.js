// ─── Reusable CORS Configuration ─────────────────────────────
// Shared by app.js (Express middleware) and standalone Netlify Functions.
// Single source of truth for all CORS settings.

const whitelist = [
  "https://www.notestandard.com",
  "https://notestandard.com",
  "https://api.notestandard.com",
];

// Allow localhost/local network origins regardless of environment
whitelist.push(
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
  "http://localhost:8888",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:3000",
);

/**
 * Express cors() middleware options.
 * Usage: app.use(cors(corsOptions));
 */
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, health checks, etc)
    if (!origin) return callback(null, true);

    // Dynamic checks for allowed domains
    const isNoteStandard = origin.endsWith(".notestandard.com") ||
      origin === "https://notestandard.com";

    // Robust local check: allow any localhost port or loopback variation
    const isLocal = origin.startsWith("http://localhost") ||
      origin.startsWith("http://127.0.0.1") ||
      origin.includes("[::1]");

    if (isNoteStandard || isLocal) {
      return callback(null, true);
    }

    console.warn(`CORS blocked for origin: ${origin}`);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Requested-With",
    "Accept",
    "Cache-Control",
    "X-Client-Info",
    "apikey", // Necessary for direct Supabase/PostgREST proxied requests
  ],
  exposedHeaders: ["X-Total-Count", "Content-Disposition"],
  maxAge: 86400, // Cache preflight for 24 hours
  optionsSuccessStatus: 200,
};

/**
 * Generate CORS headers object for manual use in raw Netlify Functions.
 * Usage: return { statusCode: 200, headers: corsHeaders(origin), body: '...' };
 */
function corsHeaders(origin) {
  const headers = {
    "Vary": "Origin",
  };
  if (origin && whitelist.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Access-Control-Allow-Methods"] =
      "GET, POST, PUT, DELETE, PATCH, OPTIONS";
    headers["Access-Control-Allow-Headers"] =
      "Content-Type, Authorization, X-Requested-With, Accept, Cache-Control";
    headers["Access-Control-Max-Age"] = "86400";
  }
  return headers;
}

/**
 * Handle OPTIONS preflight for raw Netlify Functions (non-Express).
 * Usage: if (event.httpMethod === 'OPTIONS') return handlePreflight(event);
 */
function handlePreflight(event) {
  const origin = event.headers.origin || event.headers.Origin || "";
  return {
    statusCode: 204,
    headers: corsHeaders(origin),
    body: "",
  };
}

module.exports = { whitelist, corsOptions, corsHeaders, handlePreflight };
