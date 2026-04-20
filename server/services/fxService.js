const SnapshotService = require("./SnapshotService");
const DecisionEngine = require("./DecisionEngine");
const ACE = require("./chaos/AntiConsensusEngine");
const epistemicManager = require("./chaos/EpistemicManager");
const logger = require("../utils/logger");
const cache = require("../utils/cache");

/**
 * FX Service (Strict v6.0 Shadow Integrated)
 * Handles currency rates with LKG fallback and execution-layer sanity checks.
 * Phase 1: Shadow Mode Reconciliation Enabled.
 */
class FXService {
  constructor() {
    this.FRESH_TTL = 60; // 60 seconds (Live)
    this.STALE_THRESHOLD = 3600; // 1 hour (LKG limit)
    this.SANITY_DEVIATION_CAP = 0.15; // 15% max jump per tick
    
    this.coinMapping = {
      "BTC": "bitcoin",
      "ETH": "ethereum",
      "USDT": "tether",
      "USDC": "usd-coin",
    };
    this.DRIFT_WINDOW = 5; // Rolling snapshots for velocity
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
        const deviation = Math.abs(newPrice - currentLKG) / currentLKG;
        if (deviation > this.SANITY_DEVIATION_CAP) {
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
    
    const mode = age < this.STALE_THRESHOLD ? 'STALE' : 'INVALID';

    if (mode === 'INVALID') {
        const SystemState = require("../config/SystemState");
        SystemState.enterSafeMode(`Pricing INVALID state: Feed stalled beyond recovery threshold for ${symbol}.`);
    }

    return { price: lkgValue, mode, stale: true };
  }

  /**
   * Get price metadata for crypto
   */
  async getPriceMetadata(symbol, useCache = true) {
    const sym = symbol.toUpperCase();
    const cacheKey = `crypto_meta_${sym}`;

    const fetcher = async () => {
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
        logger.error(`[FXService] Fetch failed for ${sym}: ${err.message}`);
        return await this._handleLKG(sym);
      }
    };

    if (!useCache) return await fetcher();
    return cache.wrap(cacheKey, this.FRESH_TTL, fetcher);
  }

  /**
   * Hardened Rate Engine (The source of truth for execution)
   */
  async getValidatedRate(from, to, useCache = true) {
    const fromSym = from.toUpperCase();
    const toSym = to.toUpperCase();
    
    if (fromSym === toSym) return { rate: 1.0, mode: 'FRESH', canExecute: true };

    try {
      // 1. Resolve FROM in USD
      let fromMeta = { price: 1.0, mode: 'FRESH' };
      if (fromSym !== 'USD') {
        if (this.coinMapping[fromSym]) {
          fromMeta = await this.getPriceMetadata(fromSym, useCache);
        } else {
          try {
            const fiatRate = await exchangeRateProvider.getFiatRate(fromSym, "USD");
            fromMeta = await this._handleLKG(fromSym, fiatRate);
          } catch {
            fromMeta = await this._handleLKG(fromSym);
          }
        }
      }

      // 2. Resolve TO in USD
      let toMeta = { price: 1.0, mode: 'FRESH' };
      if (toSym !== 'USD') {
        if (this.coinMapping[toSym]) {
          const priceMeta = await this.getPriceMetadata(toSym, useCache);
          toMeta = { 
            price: priceMeta.price > 0 ? 1 / priceMeta.price : 0, 
            mode: priceMeta.mode 
          };
        } else {
          try {
            const fiatRate = await exchangeRateProvider.getFiatRate("USD", toSym);
            toMeta = await this._handleLKG(`${toSym}_INV`, fiatRate);
          } catch {
            toMeta = await this._handleLKG(`${toSym}_INV`);
          }
        }
      }

      const combinedMode = (fromMeta.mode === 'INVALID' || toMeta.mode === 'INVALID') ? 'INVALID' 
                         : (fromMeta.mode === 'STALE' || toMeta.mode === 'STALE') ? 'STALE'
                         : 'FRESH';

      const rate = fromMeta.price * toMeta.price;
      
      return {
        rate: parseFloat(rate),
        mode: combinedMode,
        canExecute: combinedMode === 'FRESH',
        attribution: { from: fromMeta.mode, to: toMeta.mode }
      };
    } catch (err) {
      logger.error(`[FXService] Critical Rate Failure ${from}/${to}: ${err.message}`);
      return { rate: 0, mode: 'INVALID', canExecute: false };
    }
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
      const val = await this.getValidatedRate(base, sym);
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
      const wallets = await walletService.getWalletsByUserId(walletId);
      
      let legacyTotal = 0;
      let snapshotTotal = 0;

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
}

module.exports = new FXService();

