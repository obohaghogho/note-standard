const { Pool } = require("pg");

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || "").replace(":6543", ":5432"),
  ssl: { rejectUnauthorized: false },
  max: 5, // Keep connection count very low per process to fit Supabase free tier limits (max 15 overall)
  idleTimeoutMillis: 15000,
  connectionTimeoutMillis: 5000,
});

module.exports = pool;
