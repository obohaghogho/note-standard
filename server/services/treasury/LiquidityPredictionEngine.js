'use strict';

/**
 * LiquidityPredictionEngine.js
 * =============================
 * Predictive Enterprise Treasury Component with Intraday Liquidity Forecasting.
 *
 * Intraday Liquidity Forecast Formula:
 *   Expected Liquidity = Current Available + Expected Deposits - Expected Withdrawals - Expected Swaps
 *   Settlement Delay Impact = Average Provider Settlement Time (mins) * Outflow Rate
 *   Time To Shortage (minutes) = Net Buffer / Outflow Velocity Per Minute
 *
 * Periodically calculates intraday forecasts every 5 minutes to trigger auto-replenishment
 * before shortages occur.
 *
 * @module services/treasury/LiquidityPredictionEngine
 */

const liquidityManager = require('./LiquidityManager');
const logger = require('../../utils/logger');
const Decimal = require('decimal.js');

class LiquidityPredictionEngine {
  constructor() {
    this.minReserveThresholds = {
      NGN:  5000000.0,
      USD:  10000.0,
      EUR:  10000.0,
      GBP:  10000.0,
      BTC:  0.25,
      ETH:  2.5,
      USDT: 25000.0,
      USDC: 25000.0,
    };

    this.velocityHistory = new Map();
    this.depositHistory = new Map();
    this.swapHistory = new Map();

    // Provider settlement delays in minutes (SLA benchmark)
    this.providerSettlementDelaysMins = {
      FINCRA: 5,       // NIP instant 5 mins avg
      ANCHOR: 15,      // Wire/ACH 15 mins avg
      NOWPAYMENTS: 10, // Crypto 10 mins avg
    };
  }

  recordOutflow(currency, amount) {
    const cur = String(currency).toUpperCase();
    const currentList = this.velocityHistory.get(cur) || [];
    currentList.push({ amount: Number(amount), timestamp: Date.now() });

    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    this.velocityHistory.set(cur, currentList.filter(i => i.timestamp >= oneHourAgo));
  }

  recordInflow(currency, amount) {
    const cur = String(currency).toUpperCase();
    const currentList = this.depositHistory.get(cur) || [];
    currentList.push({ amount: Number(amount), timestamp: Date.now() });

    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    this.depositHistory.set(cur, currentList.filter(i => i.timestamp >= oneHourAgo));
  }

  recordSwap(currency, amount) {
    const cur = String(currency).toUpperCase();
    const currentList = this.swapHistory.get(cur) || [];
    currentList.push({ amount: Number(amount), timestamp: Date.now() });

    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    this.swapHistory.set(cur, currentList.filter(i => i.timestamp >= oneHourAgo));
  }

  /**
   * Intraday Liquidity Forecast for a provider & currency over windowMinutes.
   */
  async predictLiquidity(providerId, currency, windowMinutes = 60) {
    const prov = String(providerId).toUpperCase();
    const cur = String(currency).toUpperCase();

    const liqState = await liquidityManager.getLiquidity(prov, cur);
    const available = new Decimal(liqState.available);
    const minReserve = new Decimal(this.minReserveThresholds[cur] || 0);

    const historyOut = this.velocityHistory.get(cur) || [];
    const historyIn  = this.depositHistory.get(cur) || [];
    const historySwap = this.swapHistory.get(cur) || [];

    const hourlyOutflow  = historyOut.reduce((s, i) => s + i.amount, 0);
    const hourlyInflow   = historyIn.reduce((s, i) => s + i.amount, 0);
    const hourlySwap     = historySwap.reduce((s, i) => s + i.amount, 0);

    const baselineOutflow  = hourlyOutflow > 0 ? hourlyOutflow : (minReserve.toNumber() * 0.5);
    const expectedDeposits  = hourlyInflow > 0 ? hourlyInflow : 0;
    const expectedSwaps     = hourlySwap > 0 ? hourlySwap : 0;

    const projectedOutflow = new Decimal(baselineOutflow).add(expectedSwaps).mul(windowMinutes / 60);
    const projectedInflow  = new Decimal(expectedDeposits).mul(windowMinutes / 60);

    const settlementDelayMins = this.providerSettlementDelaysMins[prov] || 10;
    const settlementDelayImpact = projectedOutflow.div(windowMinutes).mul(settlementDelayMins);

    const netBuffer = available.add(projectedInflow).sub(projectedOutflow).sub(settlementDelayImpact).sub(minReserve);
    const perMinuteOutflow = projectedOutflow.div(windowMinutes);

    let timeToShortageMinutes = 999;
    let shortageImminent = false;

    if (netBuffer.lt(0)) {
      shortageImminent = true;
      if (perMinuteOutflow.gt(0)) {
        const minsLeft = available.sub(minReserve).div(perMinuteOutflow);
        timeToShortageMinutes = Math.max(1, Math.round(minsLeft.toNumber()));
      } else {
        timeToShortageMinutes = 0;
      }
    }

    const prediction = {
      providerId: prov,
      currency: cur,
      currentAvailable: available.toNumber(),
      intradayForecast: {
        expectedDeposits: projectedInflow.toNumber(),
        expectedWithdrawals: projectedOutflow.toNumber(),
        expectedSwaps: new Decimal(expectedSwaps).mul(windowMinutes / 60).toNumber(),
        settlementDelayMins,
        settlementDelayImpact: settlementDelayImpact.toNumber(),
      },
      projectedOutflowNextHour: projectedOutflow.toNumber(),
      minReserveThreshold: minReserve.toNumber(),
      netBuffer: netBuffer.toNumber(),
      shortageImminent,
      timeToShortageMinutes,
      recommendation: shortageImminent
        ? `LIQUIDITY_SHORTAGE_PREDICTED: Shortage in ~${timeToShortageMinutes} minutes. Initiate replenishment of ${Math.abs(netBuffer.toNumber())} ${cur} now.`
        : `LIQUIDITY_HEALTHY: Buffer of ${netBuffer.toNumber()} ${cur} sufficient for next ${windowMinutes} mins.`,
      evaluatedAt: new Date().toISOString(),
    };

    if (shortageImminent) {
      logger.warn(`[LiquidityPredictionEngine] ${prediction.recommendation}`);
    }

    return prediction;
  }
}

module.exports = new LiquidityPredictionEngine();
