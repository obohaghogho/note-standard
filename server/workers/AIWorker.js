const { Pool } = require("pg");
const logger = require("../utils/logger");

const pool = new Pool({
  connectionString: (process.env.DATABASE_URL || "").replace(":6543", ":5432"),
  ssl: { rejectUnauthorized: false },
});

async function auditAiUsage() {
  try {
    // 1. Audit AI cost metrics for generations without estimated_cost populated
    const { rows: pendingCost } = await pool.query(
      `SELECT id, tokens_used, model FROM ai_generations 
       WHERE estimated_cost IS NULL 
       AND tokens_used IS NOT NULL 
       LIMIT 100`
    );

    if (pendingCost.length === 0) return;

    logger.info(`[AIWorker] Auditing cost metrics for ${pendingCost.length} generations...`);

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const gen of pendingCost) {
        // Cost per 1K tokens estimations based on Groq pricing (Llama-3.1 8b instant ~ $0.00005 input / $0.00008 output)
        // Average cost: $0.0001 per 1000 tokens
        const tokens = parseInt(gen.tokens_used);
        const cost = (tokens / 1000) * 0.0001;

        await client.query(
          "UPDATE ai_generations SET estimated_cost = $1 WHERE id = $2",
          [cost, gen.id]
        );
      }
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    logger.error("[AIWorker] Auditing failed:", err.message);
  }
}

function start() {
  logger.info("[AIWorker] Started background AI usage auditor.");
  // Run every 2 minutes
  setInterval(auditAiUsage, 120000);
}

module.exports = {
  start,
  auditAiUsage
};
