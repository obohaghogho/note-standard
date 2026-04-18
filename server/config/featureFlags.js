/**
 * Feature Flags — server/config/featureFlags.js
 *
 * All flags default to safe values.
 * Override via environment variables without code changes.
 *
 * SAFE: This file has no side effects — it only exports a config object.
 * Existing ad routes are unaffected until they explicitly require() this file.
 */
module.exports = {
  // Core ad delivery safety switches
  ENABLE_WALLET_DEDUCTION:  process.env.FF_WALLET_DEDUCTION  !== 'false', // default ON
  ENABLE_BOT_BLOCKLIST:     process.env.FF_BOT_BLOCKLIST     !== 'false', // default ON
  ENABLE_FREQ_CAP_SERVER:   process.env.FF_FREQ_CAP_SERVER   !== 'false', // default ON

  // New features — default OFF until explicitly enabled
  ENABLE_CPM_PRICING:       process.env.FF_CPM_PRICING        === 'true', // default OFF
  ENABLE_ADVERTISER_TIERS:  process.env.FF_ADVERTISER_TIERS   === 'true', // default OFF
  ENABLE_AD_CACHE:          process.env.FF_AD_CACHE            === 'true', // default OFF

  // Tunable constants — can be adjusted without code redeploy
  COLD_START_MAX_BOOST:     parseFloat(process.env.COLD_START_MAX_BOOST    || '5'),
  FREQUENCY_CAP_MINUTES:    parseInt(process.env.FREQUENCY_CAP_MINUTES     || '10'),
  RATE_SPIKE_LIMIT:         parseInt(process.env.RATE_SPIKE_LIMIT          || '30'),
  DAILY_IMPRESSION_CAP:     parseInt(process.env.DAILY_IMPRESSION_CAP      || '50'),
  DAILY_CLICK_CAP:          parseInt(process.env.DAILY_CLICK_CAP           || '10'),
};
