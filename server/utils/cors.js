// ─── CORS Configuration ─────────────────────────────────────────
// Single source of truth for all CORS settings.

const whitelist = [
  "https://notestandard.com",
  "https://www.notestandard.com",
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

    // Dynamic checks for allowed domains (User requested)
    const isNoteStandard = origin.endsWith(".notestandard.com") ||
      origin === "https://notestandard.com" ||
      origin === "https://www.notestandard.com";

    // Robust local check: allow any localhost port or common dev variations
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
    "apikey",
  ],
  exposedHeaders: ["X-Total-Count", "Content-Disposition"],
  maxAge: 86400,
  optionsSuccessStatus: 200,
};

module.exports = { whitelist, corsOptions };
