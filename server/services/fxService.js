const SnapshotService = require("./SnapshotService");
const DecisionEngine = require("./DecisionEngine");
const ACE = require("./chaos/AntiConsensusEngine");
const epistemicManager = require("./chaos/EpistemicManager");
const logger = require("../utils/logger");
const cache = require("../utils/cache");
const supabase = require("../config/database");
const coingeckoProvider = require("../providers/coingeckoProvider");
const pLimit = require("p-limit");
const limit = pLimit(5); // Increased to 5 to prevent serialization bottlenecks during dashboard load
const nowpaymentsProvider = require("../providers/nowpaymentsProvider");
const exchangeRateProvider = require("../providers/exchangeRateProvider");

/**
 * FX Service (Strict v6.0 Shadow Integrated)
 * Handles currency rates with LKG fallback and execution-layer sanity checks.
 * Phase 1: Shadow Mode Reconciliation Enabled.
 */
class FXService {
  constructor() {
    this.FRESH_TTL = 600; // 10 minutes (Protect external APIs)
    this.STALE_THRESHOLD = 21600; // 6 hours (Expanded LKG window for display visibility)
    this.SANITY_DEVIATION_CAP = 0.15; // 15% max jump per tick
    this.pendingRequests = new Map(); // Single-flight Map: key -> Promise
    logger.info("[FXService] FXService loaded successfully");
    
    this.coinMapping = {
      "BTC": "bitcoin",
      "ETH": "ethereum",
      "USDT": "tether",
      "USDC": "usd-coin",
    };
    this.DRIFT_WINDOW = 5; // Rolling snapshots for velocity

    // ── Task 4.i: Circuit Breaker State ──────────────────────────
    // Tracks provider health to prevent 429 feedback loops.
    this.breakerTrippedUntil = 0; // Timestamp
    this.BREAKER_COOLDOWN = 15 * 60 * 1000; // 15 Minutes
    
    // Seed LKG cache with safe fallback rates on startup.
    this._bootstrapFallbackRates();
    
    // Asynchronously try to recover actual LKG from database
    this.initialize().catch(err => logger.error(`[FXService] Failed to initialize persistent LKG: ${err.message}`));
  }

  async initialize() {
    try {
      logger.info("[FXService] Initializing persistent LKG from database...");
      const snapshot = await SnapshotService.getAuthoritativeRates('DISPLAY');
      
      if (snapshot && snapshot.rates) {
        for (const [sym, price] of Object.entries(snapshot.rates)) {
          if (!price || price <= 0) continue; // NEVER poison the cache with zero prices
          
          const key = `lkg_price_${sym.toUpperCase()}`;
          const timestampKey = `lkg_time_${sym.toUpperCase()}`;
          
          // Force overwrite seeds with actual DB truth if it's valid
          cache.set(key, price, 86400 * 7);
          cache.set(timestampKey, new Date(snapshot.created_at).getTime(), 86400 * 7);
          logger.info(`[FXService] Recovered persistent LKG for ${sym}: $${price} (Age: ${Math.round((Date.now() - new Date(snapshot.created_at).getTime())/3600000)}h)`);
        }
      }
    } catch (err) {
      logger.error(`[FXService] Critical initialization error: ${err.message}`);
    }
  }

  _bootstrapFallbackRates() {
    // IMPORTANT: Keep seed prices close to current market values.
    // The sanity check quarantines any live price that deviates >15% from
    // the stored LKG (or >35% on initial-seed-sync). 
    const FALLBACK_SEEDS = {
      BTC: 70000, // Updated to be closer to recent market
      ETH: 2500,  // Updated to be closer to recent market
      USDT: 1.0,
      USDC: 1.0,
      "USD-COIN": 1.0,
      TETHER: 1.0,
      NGN: 0.00066, // ~1500 NGN per USD fallback
      JPY: 0.0067,  
      EUR: 1.08,    
      GBP: 1.27,    
    };
    for (const [sym, price] of Object.entries(FALLBACK_SEEDS)) {
      const key = `lkg_price_${sym}`;
      // Only seed if not already in cache (don't overwrite fresh live data)
      if (!cache.get(key)) {
        cache.set(key, price, 86400 * 7);
        // Stamp seeds as current time so they are within the 2h STALE window
        cache.set(`lkg_time_${sym}`, Date.now(), 86400 * 7);
        logger.info(`[FXService] Seeded fallback LKG for ${sym}: $${price} (STALE, fresh timestamp)`);
      }
    }
  }

  /**
   * Internal helper to store and retrieve LKG (Last Known Good) prices
   */
  async _handleLKG(symbol, newPrice = null) {
    const key = `lkg_price_${symbol.toUpperCase()}`;
    const timestampKey = `lkg_time_${symbol.toUpperCase()}`;
    
    if (newPrice !== null && !isNaN(newPrice) && newPrice > 0) {
      const currentLKG = cache.get(key);
      const lkgTime = cache.get(timestampKey) || 0;
      const age = (Date.now() - lkgTime) / 1000;
      
      if (currentLKG) {
        // Dynamic Sanity Check: If the data is very old, allow larger deviation
        // This prevents the "quarantine deadlock" when the market moves while the server was down.
        let syncCap = this.SANITY_DEVIATION_CAP; // Default 15%
        
        if (age > 3600) { // Older than 1 hour
           syncCap = 0.50; // Allow up to 50% jump to "catch up"
           logger.info(`[FXService] Relaxing sanity cap to 50% for ${symbol} due to stale LKG age: ${(age/3600).toFixed(1)}h`);
        }

        const deviation = Math.abs(newPrice - currentLKG) / currentLKG;
        
        if (deviation > syncCap) {
          logger.warn(`[FXService] Price spike detected for ${symbol}: ${currentLKG} -> ${newPrice} (${(deviation*100).toFixed(2)}%). Quarantining tick.`);
          const SystemState = require("../config/SystemState");
          SystemState.freezeAsset(symbol, 300);
          return { price: currentLKG, mode: 'INVALID', stale: true };
        }
      }

      cache.set(key, newPrice, 86400 * 7); // Persistent for 1 week
      cache.set(timestampKey, Date.now(), 86400 * 7);
      return { price: newPrice, mode: 'FRESH', stale: false };
    }

    // Retrieve LKG
    const lkgValue = cache.get(key);
    const lkgTime = cache.get(timestampKey) || 0;
    const age = (Date.now() - lkgTime) / 1000;

    if (!lkgValue) return { price: 0, mode: 'INVALID', stale: true };

    // ── Staleness Threshold Enforcement ─────────────────────────
    // We allow display up to STALE_THRESHOLD (6 hours).
    // Execution (trades) will check for 'STALE' or 'INVALID' and block if needed.
    let mode = 'FRESH';
    if (age > this.STALE_THRESHOLD) {
        mode = 'INVALID';
    } else if (age > 7200) { // 2 hours = execution staleness limit
        mode = 'STALE';
    }

    if (mode === 'INVALID') {
        const SystemState = require("../config/SystemState");
        SystemState.enterSafeMode(`Pricing INVALID state: Feed stalled beyond recovery threshold for ${symbol}.`);
        // We return the lkgValue anyway so the UI can show "Something" (stale price) 
        // while the 'INVALID' mode ensures no trades can be executed.
        return { price: lkgValue || 0, mode: 'INVALID', stale: true, ageSeconds: age };
    }

    return { price: lkgValue, mode, stale: age > this.FRESH_TTL, ageSeconds: age };
  }

  /**
   * Get price metadata for crypto
   */
  async getPriceMetadata(symbol, useCache = true) {
    const sym = symbol.toUpperCase();
    const cacheKey = `crypto_meta_${sym}`;

    const fetcher = async () => {
      // ── High-Availability Stablecoin Short-Circuit ────────────────
      // USDT and USDC are pegged to USD. Returning 1.0 immediately 
      // preserves API quota and prevents 429 locks.
      if (sym === "USDT" || sym === "USDC") {
        return { price: 1.0, mode: "FRESH", stale: false };
      }

      // ── Task 4.j: Circuit Breaker Check ──────────────────────────
      // If the breaker is tripped, we return LKG immediately without 
      // touching the network. This preserves rate limits and prevents hangs.
      if (Date.now() < this.breakerTrippedUntil) {
        logger.warn(`[FXService] Circuit Breaker ACTIVE for ${sym}. Serving LKG.`);
        return await this._handleLKG(sym);
      }

      // ── Task 4.a: Single-Flight Locking ───────────────────────────
      // If a fetch is already in flight for this symbol, share the promise
      const inflight = this.pendingRequests.get(sym);
      if (inflight) return inflight;

      const fetchPromise = (async () => {
        try {
          const coinId = this.coinMapping[sym];
          let rawPrice = null;
          
          if (coinId) {
            const prices = await coingeckoProvider.getPrices([coinId]);
            rawPrice = prices[coinId] || null;
          }

          if (!rawPrice) {
            rawPrice = await nowpaymentsProvider.getRate(sym, "USD");
          }

          return await this._handleLKG(sym, rawPrice);
        } catch (err) {
          logger.error(`[FXService] Fetch failed for ${sym}: ${err.message}. Using LKG.`);
          
          // Trip Circuit Breaker on 429 (Rate Limit)
          if (err.message?.includes("429") || err.status === 429 || err.message?.includes("RATE_LIMIT")) {
            logger.error(`[FXService] Critical Rate Limit detected for ${sym}. TRIPPING CIRCUIT BREAKER for 15m.`);
            this.breakerTrippedUntil = Date.now() + this.BREAKER_COOLDOWN;
            cache.set("breaker_tripped_until", this.breakerTrippedUntil, 1800); // Expose to global cache for SnapshotService
          }

          return await this._handleLKG(sym);
        } finally {
          this.pendingRequests.delete(sym); // Release lock
        }
      })();

      this.pendingRequests.set(sym, fetchPromise);
      return fetchPromise;
    };

    if (!useCache) return await limit(() => fetcher());
    return cache.wrap(cacheKey, this.FRESH_TTL, () => limit(() => fetcher()));
  }

  /**
   * Hardened Rate Engine (The source of truth for execution)
   */
  async getValidatedRate(from, to, useCache = true, isPaymentPath = false) {
    const fromSym = from.toUpperCase();
    const toSym = to.toUpperCase();
    
    if (fromSym === toSym) return { rate: 1.0, mode: 'FRESH', canExecute: true };

    const cacheKey = `rate_validated_${fromSym}_${toSym}`;
    
    const resolver = async () => {
      try {
        // ── Task 4.b: Asset Freeze Decoupling ────────────────────────
        const SystemState = require("../config/SystemState");
        if (!isPaymentPath) {
           if (SystemState.isAssetFrozen(fromSym) || SystemState.isAssetFrozen(toSym)) {
               logger.warn(`[FXService] Asset ${fromSym}/${toSym} is frozen. Blocking non-payment resolution.`);
               return { rate: 0, mode: 'INVALID', canExecute: false, reason: 'ASSET_FROZEN' };
           }
        }

        // Goal: Return how many 'toSym' units 1 'fromSym' is worth.
        // rate = (Price of fromSym in USD) / (Price of toSym in USD)

        const getPriceInUsd = async (sym) => {
          if (sym === 'USD') return { price: 1.0, mode: 'FRESH' };
          
          if (this.coinMapping[sym]) {
            return await this.getPriceMetadata(sym, useCache);
          } else {
            // For fiat: we need "price of sym in USD" (e.g. USD_per_NGN = 0.000667).
            // getAllRates('USD')[sym] gives sym_per_USD (e.g. NGN_per_USD = 1500).
            // We invert that to get USD_per_sym (0.000667) for consistent LKG storage.
            try {
              const allUsdRates = await exchangeRateProvider.getAllRates('USD');
              const symPerUsd = allUsdRates ? allUsdRates[sym] : null;
              if (symPerUsd && symPerUsd > 0) {
                const usdPerSym = 1 / symPerUsd; // e.g. 1/1500 = 0.000667
                return await this._handleLKG(sym, usdPerSym);
              }
              return await this._handleLKG(sym);
            } catch {
              return await this._handleLKG(sym);
            }
          }
        };

        const [fromMeta, toMeta] = await Promise.all([
          getPriceInUsd(fromSym),
          getPriceInUsd(toSym)
        ]);

        const combinedMode = (fromMeta.mode === 'INVALID' || toMeta.mode === 'INVALID') ? 'INVALID' 
                           : (fromMeta.mode === 'STALE' || toMeta.mode === 'STALE') ? 'STALE'
                           : 'FRESH';

        const fromPrice = fromMeta.price || 0;
        const toPrice = toMeta.price || 0;
        
        if (fromPrice <= 0) return { rate: 0, mode: 'INVALID', canExecute: false };
        
        const rate = fromPrice / toPrice;
        
        // Execution gate: allow FRESH and STALE (within 2h LKG window).
        // INVALID means the feed has been down >2h — that's the only hard block.
        const canExecute = rate > 0 && combinedMode !== 'INVALID';
        
        return {
          rate: parseFloat(rate),
          mode: combinedMode,
          canExecute,
          attribution: { from: fromMeta.mode, to: toMeta.mode }
        };
      } catch (err) {
        logger.error(`[FXService] Critical Rate Failure ${from}/${to}: ${err.message}`);
        
        // ── Task 4.g: Emergency Bootstrap Fallback ──────────────────
        // For payments, we MUST return a rate. If the engine is dead,
        // we use the bootstrap seeds to ensure settlement completes.
        if (isPaymentPath) {
          logger.warn(`[FXService] EMERGENCY: Using bootstrap fallback for payment path settlement: ${from}/${to}`);
          const fromBootstrap = (fromSym === 'USD') ? 1.0 : (cache.get(`lkg_price_${fromSym}`) || 1.0);
          const toBootstrap = (toSym === 'USD') ? 1.0 : (cache.get(`lkg_price_${toSym}`) || 1.0);
          const rate = toBootstrap / fromBootstrap; // PriceOfTo / PriceOfFrom
          
          return { rate: parseFloat(rate), mode: 'BOOTSTRAP', canExecute: true };
        }

        return { rate: 0, mode: 'INVALID', canExecute: false };
      }
    };

    if (!useCache) return await resolver();
    return cache.wrap(cacheKey, this.FRESH_TTL, resolver);
  }

  /**
   * Drift Velocity Engine (Phase 3 Predictive Layer)
   * Classifies drift into JITTER, TREND, or SHOCK regimes.
   */
  async classifyDriftRegime(walletId, currentDrift) {
    const { data: snapshots } = await supabase
      .from("market_snapshots")
      .select("confidence_score, source_metadata")
      .order("created_at", { ascending: false })
      .limit(this.DRIFT_WINDOW);

    if (!snapshots || snapshots.length < 2) return "JITTER";

    const avgConfidence = snapshots.reduce((acc, s) => acc + s.confidence_score, 0) / snapshots.length;
    
    if (currentDrift > 0.015) return "SHOCK"; // > 1.5% = Abrupt Shift
    if (currentDrift > 0.005 && avgConfidence < 0.8) return "TREND"; // 0.5% with low confidence = Slow Drift
    
    return "JITTER";
  }

  /**
   * Authoritative Baseline Push (Self-Healing Gate)
   * Strictly gated truth propagation to Legacy Cache.
   */
  async healLegacyBaseline(symbol, snapshotRate, confidence) {
    // 1. Gating Logic (User Requested Phase 3 Invariant)
    if (confidence < 0.9) return false;
    
    const latestSnapshot = cache.get("latest_market_snapshot");
    if (!latestSnapshot || latestSnapshot.confidence_score < 0.9) return false;

    // 2. Perform Healing (Observe only, align if certain)
    logger.info(`[FXService] HEALING_TRIGGERED for ${symbol}: Aligning Legacy Cache to Snapshot Truth.`);
    
    // We update the legacy internal cache for this symbol (DFOS v6.0 Baseline Repair)
    cache.set(`rate_${symbol}_USD`, {
      rate: snapshotRate,
      mode: 'HEALED',
      timestamp: Date.now(),
      canExecute: true
    }, 600); // 10 min TTL

    return true;
  }

  async getAllRates(base = "USD", walletId = null) {
    // ── SIMPLE, RELIABLE RATE RESOLUTION ────────────────────────
    // Step 1: Always fetch directly from the proven legacy engine.
    //         This calls CoinGecko → LKG fallback → seed fallback.
    //         It NEVER depends on the database or snapshot system.
    let legacy;
    try {
      legacy = await this._getLegacyRates(base);
    } catch (err) {
      logger.error(`[FXService] _getLegacyRates failed: ${err.message}`);
      legacy = { rates: {}, metadata: {} };
    }

    let rates = legacy.rates;
    let metadata = legacy.metadata;
    let evaluationId = 'LIVE';
    let frozenAssets = [];

    // ── Step 2: NON-NEGOTIABLE Ticker Integrity Check ────────────
    // Guarantee major assets are never zero. If legacy returned 0 for
    // BTC or ETH (e.g. circuit breaker active), force-fill from LKG cache.
    const SEEDS = { BTC: 70000, ETH: 2500, USD: 1, NGN: 0.00066 };
    for (const [ticker, seedPrice] of Object.entries(SEEDS)) {
      if (!rates[ticker] || rates[ticker] <= 0) {
        // Try LKG cache first (has real market data from before rate-limit)
        const lkgVal = cache.get(`lkg_price_${ticker.toUpperCase()}`);
        if (lkgVal && lkgVal > 0) {
          rates[ticker] = ticker === 'USD' ? lkgVal : (lkgVal / (rates['USD'] || 1));
          // For crypto: getValidatedRate already returns USD price directly
          const rateResult = await this.getValidatedRate(ticker, base).catch(() => ({ rate: 0 }));
          if (rateResult.rate > 0) rates[ticker] = rateResult.rate;
          metadata[ticker] = { ...(metadata[ticker] || {}), mode: 'LKG', canExecute: false };
          logger.warn(`[FXService] Filled ${ticker} from LKG cache: ${rates[ticker]}`);
        } else {
          // Last resort: use hardcoded seed
          rates[ticker] = seedPrice;
          metadata[ticker] = { ...(metadata[ticker] || {}), mode: 'SEED_FALLBACK', canExecute: false };
          logger.warn(`[FXService] Filled ${ticker} from seed: ${seedPrice}`);
        }
      }
    }

    // ── Step 3: Enrichment from Snapshot (optional, non-blocking) ─
    // Try to get a snapshot for the evaluationId and frozen assets.
    // This does NOT overwrite rates — it only adds governance metadata.
    try {
      const snapshotBase = await SnapshotService.getAuthoritativeRates('DISPLAY');
      if (snapshotBase && snapshotBase.id) {
        evaluationId = SnapshotService.generateEvaluationId(walletId || "global", snapshotBase.id, new Date());
        
        // Only use snapshot rates if they are BETTER (non-zero) than what we have
        if (snapshotBase.rates) {
          for (const [sym, snapRate] of Object.entries(snapshotBase.rates)) {
            if (snapRate > 0 && (!rates[sym] || rates[sym] <= 0)) {
              rates[sym] = snapRate;
              metadata[sym] = { mode: 'SNAPSHOT', canExecute: true };
            }
          }
        }

        // Get frozen assets from decision engine if canary
        const CanaryUtils = require("../utils/canaryUtils");
        if (CanaryUtils.isCanary(walletId) && snapshotBase.mode !== 'INVALID') {
          try {
            const DecisionEngine = require("./DecisionEngine");
            const decision = DecisionEngine.evaluate(snapshotBase, walletId, rates);
            frozenAssets = decision.frozenAssets || [];
          } catch (deErr) {
            logger.warn(`[FXService] DecisionEngine error (non-fatal): ${deErr.message}`);
          }
        }
      }
    } catch (snapErr) {
      logger.warn(`[FXService] Snapshot enrichment skipped: ${snapErr.message}`);
      // Rates already resolved above — this is purely additive
    }

    return { rates, metadata, evaluationId, frozenAssets };
  }


  /**
   * Internal Legacy Rate Fetcher
   */
  async _getLegacyRates(base) {
    const cryptoCurrencies = Object.keys(this.coinMapping);
    const fiatCurrencies = ["NGN", "EUR", "GBP", "JPY"];
    const targets = [...new Set([...cryptoCurrencies, ...fiatCurrencies, "USD"])];
    
    const results = {};
    const metadata = {};

    await Promise.all(targets.map(async (sym) => {
      const val = await this.getValidatedRate(sym, base);
      results[sym] = val.rate;
      metadata[sym] = { mode: val.mode, canExecute: val.canExecute };
    }));

    return { rates: results, metadata };
  }

  /**
   * Non-authoritative reconciliation hook
   */
  async _triggerShadowReconciliation(walletId, legacyRates, preFetchedSnapshot = null) {
    try {
      const snapshot = preFetchedSnapshot || cache.get("latest_market_snapshot") || await SnapshotService.generateMarketSnapshot();
      if (!snapshot) return;

      // Calculate total valuation mismatch for this wallet/user
      // This is the core 'Comparison Symmetry' anchor
      const walletService = require("./walletService");
      const wallets = await walletService.getWallets(walletId); // Use getWallets for array
      logger.info("[FXService] Wallet fetched successfully");
      
      let legacyTotal = 0;
      let snapshotTotal = 0;
      
      if (!Array.isArray(wallets)) {
        logger.warn("[FXService] Shadow Recon: No wallets found for user.");
        return;
      }
 
      for (const w of wallets) {
        const rateLegacy = legacyRates[w.asset] || 0;
        const rateSnapshot = snapshot.rates[w.asset] || 0;
        legacyTotal += w.balance * rateLegacy;
        snapshotTotal += w.balance * rateSnapshot;
      }

      await SnapshotService.reconcileValuation(walletId, legacyTotal, snapshotTotal, snapshot.id);
    } catch (err) {
      logger.error(`[FXService] Shadow Recon Internal Error: ${err.message}`);
    }
  }

  /**
   * Convert amount from one currency to another
   * @param {number} amount 
   * @param {string} from 
   * @param {string} to 
   * @param {boolean} useCache 
   * @returns {Object} { amount, rate }
   */
  async convert(amount, from, to, useCache = true) {
    const rate = await this.getRate(from, to);
    return {
      amount: amount * rate,
      rate: rate
    };
  }

  /**
   * Simple rate convenience method.
   * Returns a plain numeric rate (from → to).
   * Used by depositService, paymentService for conversion math.
   * Throws 'PRICE_TOO_STALE' if rate cannot be determined from live or LKG src.
   */
  async getRate(from, to) {
    const meta = await this.getValidatedRate(from, to);
    if (meta.rate <= 0) {
      throw new Error(`PRICE_TOO_STALE: No usable rate available for ${from}/${to}. Feed may be offline.`);
    }
    return meta.rate;
  }
}

module.exports = new FXService();
