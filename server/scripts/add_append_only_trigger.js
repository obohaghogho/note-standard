require("dotenv").config({ path: require("path").join(__dirname, "../.env") });
const pool = require('../config/pgPool');

async function addAppendOnlyTrigger() {
  console.log("=== Updating Append-Only Triggers with TG_OP Audit Log Precision ===");
  try {
    await pool.query(`
      CREATE OR REPLACE FUNCTION prevent_crypto_ledger_mutation()
      RETURNS TRIGGER AS $$
      BEGIN
        IF (TG_OP = 'UPDATE') THEN
          RAISE EXCEPTION 'IMMUTABLE_LEDGER_UPDATE_DENIED: crypto_ledger_entries is append-only. UPDATE operations are strictly prohibited.';
        ELSIF (TG_OP = 'DELETE') THEN
          RAISE EXCEPTION 'IMMUTABLE_LEDGER_DELETE_DENIED: crypto_ledger_entries is append-only. DELETE operations are strictly prohibited.';
        END IF;
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS trg_prevent_crypto_ledger_mutation ON public.crypto_ledger_entries;

      CREATE TRIGGER trg_prevent_crypto_ledger_mutation
      BEFORE UPDATE OR DELETE ON public.crypto_ledger_entries
      FOR EACH ROW
      EXECUTE FUNCTION prevent_crypto_ledger_mutation();
    `);

    console.log("✓ Append-Only Database Triggers updated with precise TG_OP error codes!");
  } catch (err) {
    console.error("❌ Failed to update append-only triggers:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addAppendOnlyTrigger();
