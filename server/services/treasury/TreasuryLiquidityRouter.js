/**
 * Enterprise Treasury Liquidity Router
 * ───────────────────────────────────────
 * Discovers and routes corporate treasury liquidity to fund user payouts
 * when primary destination currency balance is insufficient.
 */

const logger = require("../../utils/logger");
const supabase = require("../../config/database");

class TreasuryLiquidityRouter {
  constructor() {
    // Provider supported conversion matrix
    this.providerCapabilities = {
      fincra: {
        supportedPairs: [
          { source: "USD", destination: "NGN" },
          { source: "EUR", destination: "NGN" },
          { source: "GBP", destination: "NGN" },
          { source: "USD", destination: "GHS" },
          { source: "USD", destination: "KES" },
          { source: "EUR", destination: "GHS" }
        ],
        // Default ranking preference order
        prioritySources: ["USD", "EUR", "GBP", "GHS", "KES"]
      }
    };
  }

  /**
   * Evaluates corporate liquidity and determines the optimal funding route.
   *
   * @param {object} params
   * @param {string} params.destinationCurrency - e.g. "NGN"
   * @param {number} params.destinationAmount   - e.g. 100000
   * @param {object} params.provider            - Provider instance (e.g. FincraProvider)
   * @param {string} params.withdrawalReference - For audit linking
   * @returns {Promise<object>} Funding decision object
   */
  async findFundingRoute({ destinationCurrency, destinationAmount, provider, withdrawalReference }) {
    const destCurr = destinationCurrency.toUpperCase();
    const providerName = (provider?.name || "fincra").toLowerCase();

    logger.info(`[TreasuryLiquidityRouter] Evaluating corporate liquidity for ${destinationAmount} ${destCurr} on ${providerName} (Ref: ${withdrawalReference})`);

    // 1. Check direct destination currency merchant balance
    const merchantBal = await provider.getMerchantBalance(destCurr);
    if (merchantBal.available >= destinationAmount) {
      logger.info(`[TreasuryLiquidityRouter] Direct merchant balance sufficient (${merchantBal.available} >= ${destinationAmount} ${destCurr}). No treasury conversion required.`);
      return {
        fundingRequired: false,
        destinationCurrency: destCurr,
        destinationAmount,
        availableDirectBalance: merchantBal.available
      };
    }

    logger.warn(`[TreasuryLiquidityRouter] Direct merchant balance insufficient (${merchantBal.available} < ${destinationAmount} ${destCurr}). Discovering eligible corporate source currencies...`);

    // 2. Discover eligible conversion pairs for this provider
    const capabilities = this.providerCapabilities[providerName] || { supportedPairs: [], prioritySources: ["USD", "EUR"] };
    const candidatePairs = capabilities.supportedPairs.filter(p => p.destination === destCurr);

    if (candidatePairs.length === 0) {
      logger.warn(`[TreasuryLiquidityRouter] Provider ${providerName} has no conversion capabilities into destination currency ${destCurr}.`);
      return {
        fundingRequired: true,
        eligible: false,
        reason: `UNSUPPORTED_CONVERSION_PAIR: Provider ${providerName} does not support conversions into ${destCurr}.`
      };
    }

    // Sort candidate pairs based on priority ranking
    candidatePairs.sort((a, b) => {
      const idxA = capabilities.prioritySources.indexOf(a.source);
      const idxB = capabilities.prioritySources.indexOf(b.source);
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    // 3. Evaluate each candidate source currency
    for (const candidate of candidatePairs) {
      const sourceCurr = candidate.source;
      try {
        // Query provider merchant balance for source currency
        const sourceBalObj = await provider.getMerchantBalance(sourceCurr);
        const grossSourceAvailable = sourceBalObj.available || 0.0;

        // Query active unexpired DB reservations for this source currency
        const activeReserved = await this.getActiveReservations(providerName, sourceCurr);
        const netSourceAvailable = Math.max(0, grossSourceAvailable - activeReserved);

        logger.info(`[TreasuryLiquidityRouter] Evaluating source ${sourceCurr}: Gross Available = ${grossSourceAvailable}, Active Reserved = ${activeReserved}, Net Available = ${netSourceAvailable}`);

        if (netSourceAvailable <= 0) {
          logger.warn(`[TreasuryLiquidityRouter] Source ${sourceCurr} has zero net available liquidity post-reservations.`);
          continue;
        }

        // Obtain executable quote for this source -> destination pair
        const quote = await provider.generateConversionQuote({
          sourceCurrency: sourceCurr,
          destinationCurrency: destCurr,
          amount: destinationAmount,
          userId: "SYSTEM_TREASURY_ROUTER"
        });

        const rate = parseFloat(quote?.rate || quote?.exchangeRate || 0);
        if (!rate || rate <= 0) {
          logger.warn(`[TreasuryLiquidityRouter] Invalid quote rate (${rate}) for ${sourceCurr} -> ${destCurr}.`);
          continue;
        }

        // Calculate source requirement: amount / rate + buffer/fees
        const rawSourceRequired = quote.sourceAmount ? parseFloat(quote.sourceAmount) : Math.ceil((destinationAmount / rate) * 100) / 100;
        const providerFee = parseFloat(quote.fee || 0);
        const spreadAmount = Math.ceil(rawSourceRequired * 0.01 * 100) / 100; // 1% safety buffer
        const totalSourceRequired = rawSourceRequired + providerFee + spreadAmount;

        logger.info(`[TreasuryLiquidityRouter] Source candidate ${sourceCurr} calculation: Required = ${totalSourceRequired} ${sourceCurr} (Net Available = ${netSourceAvailable})`);

        if (netSourceAvailable >= totalSourceRequired) {
          logger.info(`[TreasuryLiquidityRouter] ✅ Selected eligible funding route: ${totalSourceRequired} ${sourceCurr} -> ${destinationAmount} ${destCurr} (Rate: ${rate})`);
          return {
            fundingRequired: true,
            eligible: true,
            providerName,
            sourceCurrency: sourceCurr,
            destinationCurrency: destCurr,
            destinationAmount,
            sourceAmount: totalSourceRequired,
            rawSourceRequired,
            fxRate: rate,
            providerFee,
            spreadAmount,
            quoteReference: quote.quoteReference || quote.id || quote.reference,
            quote
          };
        } else {
          logger.warn(`[TreasuryLiquidityRouter] Source ${sourceCurr} balance insufficient post-fees (${netSourceAvailable} < ${totalSourceRequired}).`);
        }
      } catch (candidateErr) {
        logger.warn(`[TreasuryLiquidityRouter] Error evaluating candidate source ${sourceCurr}: ${candidateErr.message}`);
      }
    }

    logger.warn(`[TreasuryLiquidityRouter] ❌ No eligible corporate source currency could cover the requested ${destinationAmount} ${destCurr} payout.`);
    return {
      fundingRequired: true,
      eligible: false,
      reason: "TREASURY_INSUFFICIENT: Corporate liquidity across all eligible source currencies is insufficient."
    };
  }

  /**
   * Helper to query active unexpired treasury reservations from Supabase.
   */
  async getActiveReservations(provider, sourceCurrency) {
    try {
      const { data, error } = await supabase
        .from("treasury_liquidity_reservations")
        .select("source_amount")
        .eq("provider", provider)
        .eq("source_currency", sourceCurrency)
        .in("status", ["SOURCE_RESERVED", "FX_QUOTE_LOCKED", "CONVERSION_SUBMITTED", "CONVERSION_PROCESSING"])
        .gt("expires_at", new Date().toISOString());

      if (error || !data) return 0.0;
      return data.reduce((sum, row) => sum + parseFloat(row.source_amount || 0), 0.0);
    } catch (err) {
      logger.warn(`[TreasuryLiquidityRouter] Failed to fetch active DB reservations: ${err.message}`);
      return 0.0;
    }
  }
}

module.exports = new TreasuryLiquidityRouter();
