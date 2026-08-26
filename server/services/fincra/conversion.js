/**
 * Fincra Integration — Currency Conversion (Fiat Only)
 * ──────────────────────────────────────────────────────
 * Supports NGN ↔ USD ↔ EUR fiat conversions via Fincra.
 *
 * CRITICAL ISOLATION:
 *   Crypto assets (BTC, ETH, USDT, USDC) are NEVER connected to this module.
 *   The existing NoteStandard crypto swap engine remains completely independent.
 *   This module handles ONLY NGN, USD, and EUR fiat conversions.
 */

const supabase             = require("../../config/database");
const { getFincraClient }  = require("./client");
const { recordFincraAudit } = require("./audit");
const { FINCRA_TX_STATUS, FINCRA_TX_TYPES, FINCRA_CURRENCIES } = require("./constants");
const { FincraApiError } = require("./errors");
const logger = require("../../utils/logger");
const { v4: uuidv4 } = require("uuid");
const complianceGate = require("../../withdrawal/complianceGate");

const ALLOWED_FIAT_CURRENCIES = new Set([
  FINCRA_CURRENCIES.NGN,
  FINCRA_CURRENCIES.USD,
  FINCRA_CURRENCIES.EUR,
]);

function assertFiatOnly(currency) {
  if (!ALLOWED_FIAT_CURRENCIES.has(currency)) {
    throw new Error(
      `Fincra conversion only supports fiat currencies (NGN, USD, EUR). Received: ${currency}. ` +
      `Crypto conversions must use the NoteStandard crypto swap engine.`
    );
  }
}

/**
 * Generate a Fincra conversion quote.
 *
 * @param {object} params
 * @param {string} params.sourceCurrency      - NGN | USD | EUR
 * @param {string} params.destinationCurrency - NGN | USD | EUR
 * @param {number} params.amount
 * @param {string} params.userId              - For audit
 * @returns {object} Quote with quoteReference, exchangeRate, fee, destinationAmount
 */
async function generateFincraQuote({ sourceCurrency, destinationCurrency, amount, userId }) {
  assertFiatOnly(sourceCurrency);
  assertFiatOnly(destinationCurrency);

  const { instance, businessId } = getFincraClient();

  const res = await instance.post("/quotes", {
    sourceCurrency,
    destinationCurrency,
    amount,
    type: "conversion",
    // business is inferred from api-key header
  });

  const quote = res.data?.data || res.data;

  await recordFincraAudit({
    action: "CONVERSION_QUOTE_GENERATED",
    userId,
    details: { sourceCurrency, destinationCurrency, amount, rate: quote?.rate || quote?.exchangeRate },
  });

  logger.info(`[Fincra/conversion] Quote generated: ${amount} ${sourceCurrency} → ${destinationCurrency}`);
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
  assertFiatOnly(sourceCurrency);
  assertFiatOnly(destinationCurrency);

  // Pre-Execution Compliance Gate for Fincra Conversions
  const complianceRes = await complianceGate.evaluateConversion({
    userId,
    amount: parseFloat(amount),
    currency: sourceCurrency,
  });

  if (!complianceRes.allowed) {
    throw new Error(`${complianceRes.errorCode}: ${complianceRes.reason}`);
  }

  const reference = `FIN_CONV_${uuidv4()}`;
  const { instance, businessId } = getFincraClient();

  // Create a pending fincra_transactions record
  await supabase.from("fincra_transactions").insert({
    user_id:  userId,
    reference,
    type:     FINCRA_TX_TYPES.CONVERSION,
    currency: sourceCurrency,
    amount:   parseFloat(amount),
    status:   FINCRA_TX_STATUS.PENDING,
    metadata: { quoteReference, sourceCurrency, destinationCurrency },
  });

  const res = await instance.post("/conversions", {
    quoteReference,
    customerReference: reference,
    // business is inferred from api-key header
  });

  const convData    = res.data?.data || res.data;
  const fincraRef   = convData?.reference || convData?.id;

  await supabase.from("fincra_transactions")
    .update({ status: FINCRA_TX_STATUS.PROCESSING, fincra_reference: fincraRef })
    .eq("reference", reference);

  await recordFincraAudit({
    action: "CONVERSION_EXECUTED",
    userId,
    details: { reference, fincraRef, sourceCurrency, destinationCurrency, amount },
  });

  logger.info(`[Fincra/conversion] Conversion submitted. Reference: ${reference}`);
  return { reference, fincraRef, status: FINCRA_TX_STATUS.PROCESSING };
}

module.exports = { generateFincraQuote, executeFincraConversion };
