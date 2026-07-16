const LedgerService = require("./services/LedgerService");
const supabase = require("./config/database");
const logger = require("./utils/logger");
const math = require("./utils/mathUtils");

/**
 * Forensic Normalization Script (Phase 6A)
 * Identifies negative balances and reconciles them via compensating journal entries.
 */
async function runForensicNormalization() {
  logger.info("[Normalization] Starting forensic audit...");

  try {
    // 1. Identify System Reserve Wallet for USD, BTC, ETH
    const { data: lpWallets, error: lpError } = await supabase
      .from('wallets_store')
      .select('id, currency')
      .eq('address', 'SYSTEM_LP_USD')
      .or(`address.eq.SYSTEM_LP_BTC,address.eq.SYSTEM_LP_ETH`);

    if (lpError || !lpWallets || lpWallets.length === 0) throw new Error("Could not find System LP wallets.");
    const lpMap = lpWallets.reduce((acc, w) => ({ ...acc, [w.currency]: w.id }), {});
    const systemId = lpWallets[0].user_id; // Dynamically resolve from the bootstrapped LP owner

    // 2. Scan for negative balances in v6 view
    const { data: anomalies, error: scanError } = await supabase
      .from('wallets_v6')
      .select('*')
      .lt('balance', 0);

    if (scanError) throw scanError;
    if (!anomalies || anomalies.length === 0) {
      logger.info("[Normalization] No negative balances found. System is clean.");
      return;
    }

    logger.warn(`[Normalization] Found ${anomalies.length} anomalous wallets requiring forensic offset.`);

    const batchId = `norm_${Date.now()}`;

    for (const wallet of anomalies) {
      const amountToReconcile = Math.abs(wallet.balance);
      const currency = wallet.currency;
      const lpWalletId = lpMap[currency];

      if (!lpWalletId) {
        logger.error(`[Normalization] Skipping wallet ${wallet.id}: No LP counterparty for ${currency}`);
        continue;
      }

      logger.info(`[Normalization] Reconciling ${wallet.id} (${currency}): ${amountToReconcile}`);

      const entries = [
        {
          wallet_id: lpWalletId,
          user_id: systemId,
          currency: currency,
          amount: -amountToReconcile,
          side: 'DEBIT'
        },
        {
          wallet_id: wallet.id,
          user_id: wallet.user_id,
          currency: currency,
          amount: amountToReconcile,
          side: 'CREDIT'
        }
      ];

      await LedgerService.commitAtomicEvent({
        idempotencyKey: `norm_${wallet.id}_${batchId}`,
        type: 'NORMALIZATION',
        status: 'SETTLED',
        metadata: {
          original_balance: wallet.balance,
          reason: 'Phase 6A Forensic Normalization',
          batch_id: batchId
        },
        entries: entries
      });
    }

    logger.info("[Normalization] SUCCESS: Forensic batch complete.");

  } catch (err) {
    logger.error("[Normalization] FATAL FAILURE:", err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  runForensicNormalization();
}
