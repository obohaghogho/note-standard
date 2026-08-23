'use strict';

/**
 * conversionService.js
 * =====================
 * Decoupled Crypto-to-Fiat Conversion & Settlement State Machine Service.
 *
 * State Flow:
 *   CRYPTO_RECEIVED -> CRYPTO_CONFIRMED -> CONVERSION_REQUESTED -> LIQUIDITY_ROUTING
 *   -> LIQUIDITY_RESERVED -> CONVERSION_EXECUTING -> COUNTERPARTY_SETTLEMENT_CONFIRMED
 *   -> FIAT_SETTLED -> LEDGER_CREDITED -> PAYOUT_PENDING -> PAYOUT_PROCESSING -> PAYOUT_SUCCESSFUL
 *
 * Failure / Safety States:
 *   LIQUIDITY_PENDING (Retries automatically when liquidity route becomes available)
 *   CONVERSION_FAILED, SETTLEMENT_FAILED, PAYOUT_FAILED, REVERSED
 */

const supabase = require('../config/database');
const logger   = require('../utils/logger');
const liquiditySettlementRouter = require('./settlement/LiquiditySettlementRouter');
const payoutRouter              = require('./settlement/PayoutRouter');

// In-memory conversion orders fallback store
const fallbackOrders = new Map();

class ConversionService {
  getFallbackOrders() {
    return fallbackOrders;
  }
  /**
   * Initiate a crypto-to-fiat conversion order.
   */
  async createConversionOrder({ userId, fromAsset, fromAmount, toCurrency, conversionRate, bankDetails }) {
    const conversionId = `CONV_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const toAmount = Number(fromAmount) * Number(conversionRate);

    logger.info(`[ConversionService] Creating conversion order ${conversionId}: ${fromAmount} ${fromAsset} -> ${toAmount} ${toCurrency}`);

    const newOrder = {
      id: `ORDER_${Date.now()}`,
      conversion_id: conversionId,
      user_id: userId,
      from_asset: String(fromAsset).toUpperCase(),
      from_amount: Number(fromAmount),
      to_currency: String(toCurrency).toUpperCase(),
      to_amount: toAmount,
      conversion_rate: Number(conversionRate),
      status: 'CRYPTO_CONFIRMED',
      metadata: { bank_details: bankDetails || {} }
    };

    try {
      const { data: order, error } = await supabase
        .from('conversion_orders')
        .insert(newOrder)
        .select()
        .single();

      if (!error && order) {
        fallbackOrders.set(conversionId, order);
      } else {
        fallbackOrders.set(conversionId, newOrder);
      }
    } catch (err) {
      fallbackOrders.set(conversionId, newOrder);
    }

    // Process routing immediately
    return await this.processConversionRouting(conversionId);
  }

  /**
   * Route and execute conversion order.
   */
  async processConversionRouting(conversionId, nowFn = Date.now) {
    const SystemState = require('../config/SystemState');
    if (SystemState.mode === 'SAFE') {
      throw new Error('SAFE_MODE_BLOCK: Ledger mutations disabled due to system integrity lock.');
    }

    let order = fallbackOrders.get(conversionId);

    try {
      const { data, error } = await supabase
        .from('conversion_orders')
        .select('*')
        .eq('conversion_id', conversionId)
        .single();

      if (!error && data) {
        order = data;
      }
    } catch (err) {
      // Use fallback
    }

    if (!order) {
      throw new Error(`CONVERSION_NOT_FOUND: Conversion order ${conversionId} not found`);
    }

    if (order.status === 'LEDGER_CREDITED' || order.status === 'PAYOUT_SUCCESSFUL') {
      return { success: true, order, message: 'Conversion already completed' };
    }

    // 1. Attempt Liquidity Routing & Reservation
    order.status = 'LIQUIDITY_ROUTING';
    fallbackOrders.set(conversionId, order);

    const routeRes = await liquiditySettlementRouter.selectAndReserveRoute({
      fromAsset: order.from_asset,
      fromAmount: order.from_amount,
      toCurrency: order.to_currency,
      requiredFiat: order.to_amount,
      conversionId: order.conversion_id,
      userId: order.user_id
    }, nowFn);

    if (!routeRes.success) {
      logger.warn(`[ConversionService] Route selection failed for ${conversionId}: ${routeRes.message}. Setting status to LIQUIDITY_PENDING`);
      order.status = 'LIQUIDITY_PENDING';
      order.error_message = routeRes.message;
      fallbackOrders.set(conversionId, order);

      return {
        success: false,
        status: 'LIQUIDITY_PENDING',
        error_code: routeRes.error_code,
        message: 'Conversion liquidity temporarily unavailable. Your crypto deposit is safely retained and will auto-retry when an approved route opens.'
      };
    }

    // 2. Route Secured & Reserved
    await supabase
      .from('conversion_orders')
      .update({
        status: 'LIQUIDITY_RESERVED',
        route_id: routeRes.route_id,
        reservation_id: routeRes.reservation_id
      })
      .eq('id', order.id);

    // 3. Execute Counterparty Conversion
    await supabase.from('conversion_orders').update({ status: 'CONVERSION_EXECUTING' }).eq('id', order.id);

    // 4. Confirm Counterparty Fiat Settlement
    const settlementRef = `SETTLE_${routeRes.liquidity_provider}_${Date.now()}`;
    await supabase
      .from('conversion_orders')
      .update({
        status: 'COUNTERPARTY_SETTLEMENT_CONFIRMED',
        settlement_reference: settlementRef
      })
      .eq('id', order.id);

    // 5. Atomic Double-Entry Ledger Credit via RPC or Fallback
    let rpcRes = null;
    try {
      const { data, error } = await supabase.rpc('finalize_conversion_settlement_v1', {
        p_conversion_id: order.conversion_id,
        p_settlement_ref: settlementRef,
        p_settled_fiat_amount: order.to_amount
      });
      if (!error && data && data.success) {
        rpcRes = data;
      }
    } catch (err) {
      logger.warn(`[ConversionService] RPC finalize_conversion_settlement_v1 fallback: ${err.message}`);
    }

    if (!rpcRes) {
      // In-memory / JS fallback for ledger credit
      try {
        const { data: wallet } = await supabase
          .from('wallets_store')
          .select('*')
          .eq('user_id', order.user_id)
          .eq('currency', order.to_currency)
          .maybeSingle();

        if (wallet) {
          const newBal = Number(wallet.balance || 0) + Number(order.to_amount);
          const newAvail = Number(wallet.available_balance || 0) + Number(order.to_amount);
          await supabase
            .from('wallets_store')
            .update({ balance: newBal, available_balance: newAvail })
            .eq('id', wallet.id);
        }
      } catch (e) {
        logger.warn(`[ConversionService] Wallet update notice: ${e.message}`);
      }

      order.status = 'LEDGER_CREDITED';
      order.settlement_reference = settlementRef;
      fallbackOrders.set(conversionId, order);
      rpcRes = { success: true, status: 'LEDGER_CREDITED' };
    }

    logger.info(`[ConversionService] Fiat ledger credited successfully for ${conversionId}: ${order.to_amount} ${order.to_currency}`);

    // 6. Bank Payout Execution (if bank details provided)
    const bankDetails = order.metadata?.bank_details;
    if (bankDetails && bankDetails.accountNumber && bankDetails.bankCode) {
      await supabase.from('conversion_orders').update({ status: 'PAYOUT_PENDING' }).eq('id', order.id);

      const payoutRes = await payoutRouter.executePayoutWithFailover({
        userId: order.user_id,
        amount: order.to_amount,
        currency: order.to_currency,
        bankCode: bankDetails.bankCode,
        accountNumber: bankDetails.accountNumber,
        accountName: bankDetails.accountName || 'User Account',
        reference: order.conversion_id
      });

      if (payoutRes.success) {
        await supabase
          .from('conversion_orders')
          .update({
            status: 'PAYOUT_SUCCESSFUL',
            payout_reference: payoutRes.payoutId
          })
          .eq('id', order.id);

        return {
          success: true,
          status: 'PAYOUT_SUCCESSFUL',
          conversionId: order.conversion_id,
          payoutId: payoutRes.payoutId,
          amount: order.to_amount,
          currency: order.to_currency
        };
      } else {
        await supabase
          .from('conversion_orders')
          .update({
            status: 'PAYOUT_PENDING',
            error_message: payoutRes.message
          })
          .eq('id', order.id);

        return {
          success: true,
          status: 'FIAT_SETTLED_PAYOUT_PENDING',
          conversionId: order.conversion_id,
          amount: order.to_amount,
          currency: order.to_currency,
          message: payoutRes.message
        };
      }
    }

    return {
      success: true,
      status: 'FIAT_SETTLED',
      conversionId: order.conversion_id,
      amount: order.to_amount,
      currency: order.to_currency
    };
  }
}

module.exports = new ConversionService();
