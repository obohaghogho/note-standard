// ─── CORS Configuration ─────────────────────────────────────────
// Single source of truth for all CORS settings.

const whitelist = [
  process.env.CLIENT_URL || "https://notestandard.com",
  "https://www.notestandard.com",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
  "http://localhost:8888",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5001",
  "http://localhost:5001",
  "http://[::1]:5173",
];

const isProd = process.env.NODE_ENV === "production";

/**
 * Express cors() middleware options.
 * Usage: app.use(cors(corsOptions));
 */
const isOriginAllowed = (origin) => {
  // Allow server-to-server or direct requests (no origin header)
  if (!origin) return true;

  const clientUrl = process.env.CLIENT_URL || "https://notestandard.com";

  // 1. Production Allowed Domains
  const isNoteStandard = origin === clientUrl || 
    origin === "https://www.notestandard.com" ||
    origin === "https://notestandard.com" ||
    origin.endsWith(".notestandard.com");

  if (isProd) {
    const isMobileLocal = origin === "http://localhost" || origin === "http://127.0.0.1" || origin.startsWith("exp://");
    if (!isNoteStandard && !isMobileLocal && origin !== "http://localhost:5173" && origin !== "http://localhost:4173") {
        console.warn(`[CORS] Blocked production access from: ${origin}`);
    }
    return isNoteStandard || isMobileLocal || origin === "http://localhost:5173" || origin === "http://localhost:4173";
  }

  // 2. Local Development Allowed Domains (only if not in production)
  const isLocal = origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1") ||
    origin.includes("[::1]");

  const result = isNoteStandard || isLocal;
  
  if (!result) {
    console.warn(`[CORS Check] Origin NOT allowed: ${origin}`);
  }
  return result;
};

/**
 * Express cors() middleware options.
 * Usage: app.use(cors(corsOptions));
 */
const corsOptions = {
  origin: (origin, callback) => {
    if (isOriginAllowed(origin)) {
      return callback(null, true);
    }
    console.warn(`[CORS Middleware] Blocked origin: ${origin}`);
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
    "apikey",
    "Pragma",
    "x-device-id",
  ],
  exposedHeaders: ["X-Total-Count", "Content-Disposition"],
  maxAge: 86400,
  optionsSuccessStatus: 200,
};

module.exports = { whitelist, corsOptions, isOriginAllowed };
