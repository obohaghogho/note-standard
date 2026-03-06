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
  async getTransactions(userId, { page = 1, limit = 20, type = null } = {}) {
    const { data: wallets, error: walletError } = await supabase
      .from("wallets")
      .select("id")
      .eq("user_id", userId);

    if (walletError || !wallets || wallets.length === 0) {
      return {
        transactions: [],
        pagination: { page, limit, totalCount: 0, hasMore: false },
      };
    }

    const walletIds = wallets.map((w) => w.id);
    const start = (page - 1) * limit;
    const end = start + limit - 1;

    let query = supabase
      .from("transactions")
      .select(`*, wallet:wallets(currency, network)`, { count: "exact" })
      .in("wallet_id", walletIds)
      .order("created_at", { ascending: false });

    if (type) {
      query = query.eq("type", type);
    }

    const { data: txs, error: txError, count: totalCount } = await query.range(
      start,
      end,
    );

    if (txError) throw txError;

    return {
      transactions: txs || [],
      pagination: {
        page,
        limit,
        totalCount: totalCount || 0,
        hasMore: (totalCount || 0) > (page * limit),
      },
    };
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
