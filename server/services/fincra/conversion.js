/**
 * Fincra Integration — Currency Conversion Service
 * ──────────────────────────────────────────────────────
 * Supports NGN ↔ USD ↔ EUR fiat conversions AND Fincra Manual OTC USDT/USDC → NGN conversions.
 *
 * ASSET CLASSIFICATION & PAIR VALIDATION:
 *   - Explicit conversion pair validation enforces allowed source-destination pairs.
 *   - Minimum supported OTC crypto pairs: USDT → NGN, USDC → NGN.
 *   - Unsupported pairs (e.g. BTC → NGN, NGN → USDT) are rejected before any Fincra API request.
 */

'use strict';

const supabase             = require("../../config/database");
const { getFincraClient }  = require("./client");
const { recordFincraAudit } = require("./audit");
const { 
  FINCRA_TX_STATUS, 
  FINCRA_TX_TYPES, 
  FINCRA_CURRENCIES,
  ALLOWED_CONVERSION_PAIRS,
  SUPPORTED_CRYPTO_CONVERSION_SET,
} = require("./constants");
const { FincraApiError }   = require("./errors");
const logger               = require("../../utils/logger");
const { v4: uuidv4 }       = require("uuid");
const complianceGate       = require("../../withdrawal/complianceGate");

/**
 * Validate conversion pair before invoking Fincra API.
 *
 * @param {string} sourceCurrency
 * @param {string} destinationCurrency
 */
function assertSupportedConversionPair(sourceCurrency, destinationCurrency) {
  const source = String(sourceCurrency || "").toUpperCase().trim();
  const dest   = String(destinationCurrency || "").toUpperCase().trim();

  if (!source || !dest) {
    throw new Error("INVALID_CURRENCY: Source and destination currencies are required.");
  }

  const pair = `${source}-${dest}`;

  if (!ALLOWED_CONVERSION_PAIRS.has(pair)) {
    throw new Error(
      `UNSUPPORTED_CONVERSION_PAIR: Conversion pair ${source} → ${dest} is not supported by Fincra integration.`
    );
  }
}

/**
 * Generate a Fincra conversion quote.
 *
 * @param {object} params
 * @param {string} params.sourceCurrency      - NGN | USD | EUR | USDT | USDC
 * @param {string} params.destinationCurrency - NGN | USD | EUR
 * @param {number} params.amount
 * @param {string} params.userId              - For audit
 * @returns {object} Quote with quoteReference, exchangeRate, fee, destinationAmount
 */
async function generateFincraQuote({ sourceCurrency, destinationCurrency, amount, userId }) {
  const upSource = String(sourceCurrency).toUpperCase().trim();
  const upDest   = String(destinationCurrency).toUpperCase().trim();

  assertSupportedConversionPair(upSource, upDest);

  const { instance, businessId } = getFincraClient();

  const res = await instance.post("/quotes", {
    sourceCurrency: upSource,
    destinationCurrency: upDest,
    amount: parseFloat(amount),
    type: "conversion",
  });

  const quote = res.data?.data || res.data;

  await recordFincraAudit({
    action: "CONVERSION_QUOTE_GENERATED",
    userId,
    details: { sourceCurrency: upSource, destinationCurrency: upDest, amount: parseFloat(amount), rate: quote?.rate || quote?.exchangeRate },
  });

  logger.info(`[Fincra/conversion] Quote generated: ${amount} ${upSource} → ${upDest}`);
  return quote;
}

/**
 * Execute a Fincra currency conversion using a confirmed quote reference.
 *
 * @param {object} params
 * @param {string} params.quoteReference
 * @param {string} params.userId
 * @param {string} params.sourceCurrency
 * @param {string} params.destinationCurrency
 * @param {number} params.amount
 */
async function executeFincraConversion({ quoteReference, userId, sourceCurrency, destinationCurrency, amount }) {
  const upSource = String(sourceCurrency).toUpperCase().trim();
  const upDest   = String(destinationCurrency).toUpperCase().trim();

  assertSupportedConversionPair(upSource, upDest);

  // Pre-Execution Compliance Gate for Fincra Conversions
  const complianceRes = await complianceGate.evaluateConversion({
    userId,
    amount: parseFloat(amount),
    currency: upSource,
  });

  if (!complianceRes.allowed) {
    throw new Error(`${complianceRes.errorCode}: ${complianceRes.reason}`);
  }

  const reference = `FIN_CONV_${uuidv4().replace(/-/g, "").substring(0, 16)}`;
  const { instance, businessId } = getFincraClient();

  // Create a pending fincra_transactions record
  await supabase.from("fincra_transactions").insert({
    user_id:               userId,
    reference,
    type:                  FINCRA_TX_TYPES.CONVERSION,
    currency:              upSource,
    source_asset:          upSource,
    destination_currency:  upDest,
    amount:                parseFloat(amount),
    status:                FINCRA_TX_STATUS.PENDING,
    metadata:              { quoteReference, sourceCurrency: upSource, destinationCurrency: upDest },
  });

  const res = await instance.post("/conversions", {
    quoteReference,
    customerReference: reference,
  });

  const convData    = res.data?.data || res.data;
  const fincraRef   = convData?.reference || convData?.id;

  await supabase.from("fincra_transactions")
    .update({ status: FINCRA_TX_STATUS.PROCESSING, fincra_reference: fincraRef })
    .eq("reference", reference);

  await recordFincraAudit({
    action: "CONVERSION_EXECUTED",
    userId,
    details: { reference, fincraRef, sourceCurrency: upSource, destinationCurrency: upDest, amount },
  });

  logger.info(`[Fincra/conversion] Conversion submitted. Reference: ${reference}`);
  return { reference, fincraRef, status: FINCRA_TX_STATUS.PROCESSING };
}

module.exports = {
  assertSupportedConversionPair,
  generateFincraQuote,
  executeFincraConversion,
};
