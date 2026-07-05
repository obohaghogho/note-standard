require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || '').replace(':6543', ':5432'),
  ssl: { rejectUnauthorized: false }
});

const indices = [
  // 1. Full-text search GIN index
  "CREATE INDEX IF NOT EXISTS notes_search_idx ON notes USING GIN(search_vector)",
  
  // 2. Index for retrieving active notes for an owner
  "CREATE INDEX IF NOT EXISTS notes_owner_active_idx ON notes(owner_id) WHERE deleted_at IS NULL",
  
  // 3. Composite index for soft-deleted notes filter
  "CREATE INDEX IF NOT EXISTS notes_owner_deleted_idx ON notes(owner_id, deleted_at) WHERE deleted_at IS NOT NULL",
  
  // 4. Index for category filter queries
  "CREATE INDEX IF NOT EXISTS notes_category_idx ON notes(category_id) WHERE deleted_at IS NULL AND category_id IS NOT NULL",
  
  // 5. Index for favorited notes filter
  "CREATE INDEX IF NOT EXISTS notes_favorite_idx ON notes(owner_id, is_favorite) WHERE deleted_at IS NULL AND is_favorite = true",
  
  // 6. Index for pinned notes filter
  "CREATE INDEX IF NOT EXISTS notes_pinned_idx ON notes(owner_id, is_pinned) WHERE deleted_at IS NULL AND is_pinned = true",
  
  // 7. Index for order sorting (updated_at)
  "CREATE INDEX IF NOT EXISTS notes_updated_at_idx ON notes(owner_id, updated_at DESC) WHERE deleted_at IS NULL"
];

async function applyIndices() {
  console.log("Connected to PostgreSQL for performance index optimization.");
  try {
    for (const sql of indices) {
      console.log(`Applying: ${sql}...`);
      await pool.query(sql);
    }
    console.log("All performance optimization indices applied successfully!");
    process.exit(0);
  } catch (err) {
    console.error("Failed to apply performance indices:", err.message);
    process.exit(1);
  }
}

applyIndices();
