const { Pool } = require("pg");

if (!process.env.DATABASE_URL) {
  console.warn("[pgPool] ⚠️  DATABASE_URL is not set. Direct PostgreSQL queries (dashboard, etc.) will fail gracefully. Add DATABASE_URL to server/.env to enable these features.");
}

// Stub pool that returns an error for all queries if DATABASE_URL is missing
const stubPool = {
  query: async () => { throw new Error("DATABASE_URL is not configured. Please add it to server/.env."); },
  connect: async () => { throw new Error("DATABASE_URL is not configured. Please add it to server/.env."); },
};

if (!process.env.DATABASE_URL) {
  module.exports = stubPool;
} else {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL.replace(":6543", ":5432"),
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 15000,
    connectionTimeoutMillis: 5000,
  });
  module.exports = pool;
}
