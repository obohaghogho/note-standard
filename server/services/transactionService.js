const supabase = require("../config/database");
const logger = require("../utils/logger");

/**
 * Transaction Service
 * Records and fetches all ledger activity.
 */
class TransactionService {
  /**
   * Get paginated transaction history for a user
   */
  async getHistory(userId, { page = 1, limit = 20, type = null } = {}) {
    try {
      const pageNum = parseInt(page) || 1;
      const limitNum = parseInt(limit) || 20;
      const start = (pageNum - 1) * limitNum;
      const end = start + limitNum - 1;

      let query = supabase
        .from("transactions")
        .select(`*`, { count: "exact" })
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      if (type) {
        query = query.eq("type", type);
      }

      const { data: txs, error: txError, count: totalCount } = await query
        .range(
          start,
          end,
        );

      if (txError) {
        logger.error(
          `[TransactionService] Error fetching transactions: ${txError.message}`,
          txError,
        );
        throw txError;
      }

      return {
        transactions: txs || [],
        pagination: {
          page: pageNum,
          limit: limitNum,
          totalCount: totalCount || 0,
          hasMore: (totalCount || 0) > (pageNum * limitNum),
        },
      };
    } catch (err) {
      logger.error(
        `[TransactionService] getHistory Crash: ${err.message}`,
        err,
      );
      throw err;
    }
  }

  /**
   * Record a non-financial activity or metadata note
   */
  async recordActivity(userId, activityType, details = {}) {
    logger.info(`[TransactionService] Recording activity: ${activityType}`, {
      userId,
      ...details,
    });

    // Internal logging or potentially a separate 'ledger_audit' table if exists
    // For now, we use the logger. Real financial transactions are recorded by WalletService/SwapEngine.
    return true;
  }
}

module.exports = new TransactionService();
