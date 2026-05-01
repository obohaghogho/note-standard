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
    // These are intentionally stale-flagged and will be overwritten by the
    // first successful live fetch. They prevent $0.00 during cold boot.
    this._bootstrapFallbackRates();
  }

  _bootstrapFallbackRates() {
    // IMPORTANT: Keep seed prices close to current market values.
    // The sanity check quarantines any live price that deviates >15% from
    // the stored LKG (or >35% on initial-seed-sync). An outdated seed will
    // permanently block live prices from being accepted, pinning mode to INVALID.
    //
    // Seeds are stamped with the current time so they start STALE (within the
    // 2h execution window) instead of appearing almost-expired from the start.
    // The first successful live fetch will replace these with FRESH prices.
    const FALLBACK_SEEDS = {
      BTC: 78000,
      ETH: 2350,
      USDT: 1.0,
      USDC: 1.0,
      "USD-COIN": 1.0,
      TETHER: 1.0,
      NGN: 0.00074, // ~1350 NGN per USD fallback
      JPY: 0.0067,  // ~149 JPY per USD fallback
      EUR: 1.08,    // ~0.93 EUR per USD fallback
      GBP: 1.27,    // ~0.79 GBP per USD fallback
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
      
      if (currentLKG) {
        const timestampKey = `lkg_time_${symbol.toUpperCase()}`;
        const lkgTime = cache.get(timestampKey) || 0;
        const age = (Date.now() - lkgTime) / 1000;
        const isInitialSeedSync = age > 3500; // Seed was set ~1h ago in bootstrap

        const syncCap = isInitialSeedSync ? 0.35 : this.SANITY_DEVIATION_CAP;
        const deviation = Math.abs(newPrice - currentLKG) / currentLKG;
        
        if (deviation > syncCap) {
          logger.warn(`[FXService] Price spike detected for ${symbol}: ${currentLKG} -> ${newPrice} (${(deviation*100).toFixed(2)}%). Quarantining tick.`);
          const SystemState = require("../config/SystemState");
          SystemState.freezeAsset(symbol, 300);
          return { price: currentLKG, mode: 'INVALID', stale: true };
        }
        
        if (isInitialSeedSync) {
          logger.info(`[FXService] Initial seed synchronization complete for ${symbol}. Jump: ${(deviation*100).toFixed(2)}% (Allowed: ${syncCap*100}%)`);
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
    // If the cached price is older than STALE_THRESHOLD (6 hours), mark INVALID.
    // Callers that need a clean price must use getValidatedRate() which
    // will throw PRICE_TOO_STALE for execution paths.
    const MAX_EXECUTION_STALE_SECS = 7200; // 2 hours — hard boundary for any trade
    if (age > MAX_EXECUTION_STALE_SECS) {
      logger.error(`[FXService] LKG for ${symbol} is ${(age/3600).toFixed(1)}h old — refusing to serve.`);
      return { price: 0, mode: 'INVALID', stale: true, ageSeconds: age };
    }
    
    const mode = age < this.STALE_THRESHOLD ? 'STALE' : 'INVALID';

    if (mode === 'INVALID') {
        const SystemState = require("../config/SystemState");
        SystemState.enterSafeMode(`Pricing INVALID state: Feed stalled beyond recovery threshold for ${symbol}.`);
    }

    return { price: lkgValue, mode, stale: true, ageSeconds: age };
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
    const CanaryUtils = require("../utils/canaryUtils");
    const DecisionEngine = require("./DecisionEngine");
    
    // 1. Determine Authority (Canary vs Legacy)
    const isCanary = CanaryUtils.isCanary(walletId);
    let rates = {};
    let metadata = {};
    let evaluationId = null;
    let frozenAssets = [];

    // 2. Fetch Truth (Snapshot Ledger)
    const snapshotBase = await SnapshotService.getAuthoritativeRates('DISPLAY');
    
    if (isCanary && snapshotBase.mode !== 'INVALID') {
      // CANARY PATH: Snapshot is the System of Record
      rates = snapshotBase.rates;
      evaluationId = SnapshotService.generateEvaluationId(walletId || "global", snapshotBase.id, new Date());
      
      const legacyRaw = await this._getLegacyRates(base);
      const decision = DecisionEngine.evaluate(snapshotBase, walletId, legacyRaw.rates);
      
      // Phase 5: Truth-Resilience Kernel
      const maxDrift = decision.maxDrift || 0;
      const driftFriction = ACE.calculateDriftFriction(walletId || "global", maxDrift);
      const microstructureInconsistency = ACE.checkMicrostructureConsistency(
          maxDrift * 10000, 
          snapshotBase.source_metadata?.temporal?.loadMetrics?.cpu?.user / 1e5 || 5
      );
      
      const isSuspicious = ACE.isConsensusSuspicious(
          snapshotBase.confidence_score,
          microstructureInconsistency,
          driftFriction
      );

      const epistemic = epistemicManager.evaluateState(walletId || "global", decision.score, {
          isSuspicious,
          timeIntegrityScore: snapshotBase.source_metadata?.timeIntegrityScore || 1.0
      });

      // Phase 3: Drift Velocity Engine (Predictive Layer)
      const driftRegime = await this.classifyDriftRegime(walletId || "global", maxDrift);

      // Phase 3/5: Gated Self-Healing (Disbaled in uncertainty)
      if (decision.score > 0.90 && epistemic.state === 'STABLE') {
        for (const [sym, rate] of Object.entries(rates)) {
          const legacyRate = legacyRaw.rates[sym];
          if (legacyRate && Math.abs(rate - legacyRate) / legacyRate > 0.0075) {
            await this.healLegacyBaseline(sym, rate, snapshotBase.score);
          }
        }
      }

      metadata = Object.keys(rates).reduce((acc, sym) => {
        acc[sym] = { 
          mode: snapshotBase.mode, 
          canExecute: decision.state === 'ALLOWED' || decision.state === 'SOFT_WARN',
          reason: decision.reason,
          regime: driftRegime
        };
        return acc;
      }, {});
      
      frozenAssets = decision.frozenAssets;
    } else {
      // LEGACY PATH (or Snapshot Failure)
      const legacy = await this._getLegacyRates(base);
      rates = legacy.rates;
      metadata = legacy.metadata;
      
      // If we are in Canary but failed to find a snapshot, flag the fallback
      if (isCanary) {
        Object.values(metadata).forEach(m => m.isFallback = true);
      }
      
      if (snapshotBase.id) {
        evaluationId = SnapshotService.generateEvaluationId(walletId || "global", snapshotBase.id, new Date());
      }
    }

    // 3. Shadow Reconciliation (Always run for forensics)
    if (walletId) {
      const liveSnapshot = snapshotBase.id ? snapshotBase : await cache.get("latest_market_snapshot");
      if (liveSnapshot) {
        this._triggerShadowReconciliation(walletId, rates, liveSnapshot).catch(e => 
          logger.error(`[FXService] Shadow Recon Trigger Failed: ${e.message}`)
        );
      }
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
