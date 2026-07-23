/**
 * Fincra Integration — Reconciliation Engine
 * ─────────────────────────────────────────────
 * Compares NoteStandard internal ledger records against Fincra wallet
 * transaction logs to detect missing credits, unprocessed failures,
 * and amount mismatches.
 *
 * Run this periodically (e.g. via admin request or cron job) to ensure
 * financial integrity between the internal ledger and the Fincra gateway.
 */

const supabase             = require("../../config/database");
const { getFincraWalletLogs } = require("./wallet");
const { recordFincraAudit } = require("./audit");
const { FINCRA_TX_STATUS } = require("./constants");
const logger = require("../../utils/logger");

/**
 * Run reconciliation for a given currency over a date range.
 *
 * @param {object} params
 * @param {string} params.currency    - NGN | USD | EUR
 * @param {string} params.fromDate    - ISO date string
 * @param {string} params.toDate      - ISO date string
 * @returns {object} Reconciliation report
 */
async function runFincraReconciliation({ currency = "NGN", fromDate, toDate } = {}) {
  logger.info(`[Fincra/reconciliation] Starting reconciliation for ${currency} from ${fromDate} to ${toDate}`);

  const report = {
    currency,
    fromDate,
    toDate,
    ranAt:           new Date().toISOString(),
    internalCount:   0,
    fincraCount:     0,
    matched:         [],
    missingInFincra: [],
    missingInLedger: [],
    amountMismatches: [],
    warnings:        [],
  };

  // ── 1. Fetch internal fincra_transactions ────────────────────────────────
  let query = supabase
    .from("fincra_transactions")
    .select("*")
    .eq("currency", currency)
    .in("status", [FINCRA_TX_STATUS.SUCCESSFUL, FINCRA_TX_STATUS.REVERSED]);

  if (fromDate) query = query.gte("created_at", fromDate);
  if (toDate)   query = query.lte("created_at", toDate);

  const { data: internalTxns, error: dbError } = await query;
  if (dbError) {
    logger.error(`[Fincra/reconciliation] DB error: ${dbError.message}`);
    report.warnings.push(`DB fetch error: ${dbError.message}`);
    return report;
  }

  report.internalCount = internalTxns ? internalTxns.length : 0;

  // Build lookup map: fincra_reference → internal transaction
  const internalByFincraRef = new Map();
  for (const tx of (internalTxns || [])) {
    if (tx.fincra_reference) {
      internalByFincraRef.set(tx.fincra_reference, tx);
    }
  }

  // ── 2. Fetch Fincra wallet logs ──────────────────────────────────────────
  let fincraLogs = [];
  try {
    fincraLogs = await getFincraWalletLogs({ currency, from: fromDate, to: toDate });
    report.fincraCount = fincraLogs.length;
  } catch (err) {
    logger.error(`[Fincra/reconciliation] Fincra wallet log fetch failed: ${err.message}`);
    report.warnings.push(`Fincra API error: ${err.message}`);
    // Continue with partial report using only internal data
  }

  // Build lookup map: fincra reference → fincra log entry
  const fincraByRef = new Map();
  for (const entry of fincraLogs) {
    const ref = entry.reference || entry.id;
    if (ref) fincraByRef.set(ref, entry);
  }

  // ── 3. Check internal records against Fincra ─────────────────────────────
  for (const tx of (internalTxns || [])) {
    if (!tx.fincra_reference) {
      report.warnings.push(`Internal transaction ${tx.reference} has no fincra_reference.`);
      continue;
    }

    const fincraEntry = fincraByRef.get(tx.fincra_reference);

    if (!fincraEntry) {
      report.missingInFincra.push({
        internalRef:  tx.reference,
        fincraRef:    tx.fincra_reference,
        amount:       tx.amount,
        currency:     tx.currency,
        internalStatus: tx.status,
      });
    } else {
      // Compare amounts (handle kobo/subunit if needed)
      const fincraAmount = parseFloat(fincraEntry.amount || 0);
      const internalAmount = parseFloat(tx.amount || 0);

      if (Math.abs(fincraAmount - internalAmount) > 0.01) {
        report.amountMismatches.push({
          internalRef:    tx.reference,
          fincraRef:      tx.fincra_reference,
          internalAmount,
          fincraAmount,
          diff:           fincraAmount - internalAmount,
        });
      } else {
        report.matched.push(tx.fincra_reference);
      }
    }
  }

  // ── 4. Check Fincra records against internal ─────────────────────────────
  for (const [fincraRef, entry] of fincraByRef.entries()) {
    if (!internalByFincraRef.has(fincraRef)) {
      report.missingInLedger.push({
        fincraRef,
        amount:   entry.amount,
        currency: entry.currency,
        status:   entry.status,
      });
    }
  }

  // ── 5. Generate admin alert if mismatches found ──────────────────────────
  if (report.missingInFincra.length > 0 || report.missingInLedger.length > 0 || report.amountMismatches.length > 0) {
    logger.warn("[Fincra/reconciliation] ⚠️ RECONCILIATION MISMATCH DETECTED", {
      missingInFincra: report.missingInFincra.length,
      missingInLedger: report.missingInLedger.length,
      amountMismatches: report.amountMismatches.length,
    });

    await recordFincraAudit({
      action: "RECONCILIATION_MISMATCH",
      userId: null,
      details: {
        currency,
        missingInFincraCount:   report.missingInFincra.length,
        missingInLedgerCount:   report.missingInLedger.length,
        amountMismatchCount:    report.amountMismatches.length,
      },
    });
  } else {
    logger.info(`[Fincra/reconciliation] ✅ Clean reconciliation for ${currency}. ${report.matched.length} matched.`);
    await recordFincraAudit({
      action: "RECONCILIATION_CLEAN",
      userId: null,
      details: { currency, matchedCount: report.matched.length },
    });
  }

  return report;
}

module.exports = { runFincraReconciliation };
