/**
 * Swap Service
 * Handles crypto-to-crypto swaps and exchange rate management
 */

const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const fxService = require('./fxService');

// Commission rate for swaps (0.5%)
const SWAP_FEE_RATE = 0.005;

/**
 * Get all available exchange rates
 */
async function getAllExchangeRates() {
    // In production, we fetch all major currencies or a subset
    const currencies = ['BTC', 'ETH', 'USD', 'NGN', 'EUR', 'GBP'];
    const rates = {};

    for (const from of currencies) {
        rates[from] = {};
        for (const to of currencies) {
            if (from !== to) {
                rates[from][to] = await fxService.getRate(from, to);
            }
        }
    }

    return rates;
}

/**
 * Calculate swap preview (amount out, fees)
 */
async function calculateSwapPreview(fromCurrency, toCurrency, amount) {
    const rate = await fxService.getRate(fromCurrency, toCurrency);
    const fee = amount * SWAP_FEE_RATE;
    const netAmount = amount - fee;
    const amountOut = netAmount * rate;

    return {
        fromCurrency,
        toCurrency,
        amountIn: amount,
        rate,
        fee,
        feePercentage: SWAP_FEE_RATE * 100,
        amountOut: parseFloat(amountOut.toFixed(8)),
        netAmount
    };
}

/**
 * Execute a swap between two currencies
 */
async function executeSwap(userId, fromCurrency, toCurrency, amount, idempotencyKey = null) {
    // Check for duplicate request
    if (idempotencyKey) {
        const { data: existing } = await supabase
            .from('transactions')
            .select('id')
            .eq('metadata->>idempotencyKey', idempotencyKey)
            .single();

        if (existing) {
            throw new Error('Duplicate swap request');
        }
    }

    // Get source wallet
    const { data: fromWallet, error: fromErr } = await supabase
        .from('wallets')
        .select('id, balance')
        .eq('user_id', userId)
        .eq('currency', fromCurrency)
        .single();

    if (fromErr || !fromWallet) {
        throw new Error(`${fromCurrency} wallet not found`);
    }

    // Check balance
    const parseAmount = parseFloat(amount);
    if (parseFloat(fromWallet.balance) < parseAmount) {
        throw new Error(`Insufficient ${fromCurrency} balance`);
    }

    // Get or create destination wallet
    let { data: toWallet } = await supabase
        .from('wallets')
        .select('id, balance')
        .eq('user_id', userId)
        .eq('currency', toCurrency)
        .single();

    if (!toWallet) {
        const { data: newWallet, error: createErr } = await supabase
            .from('wallets')
            .insert({
                user_id: userId,
                currency: toCurrency,
                balance: 0,
                address: uuidv4()
            })
            .select()
            .single();

        if (createErr) throw createErr;
        toWallet = newWallet;
    }

    // Calculate swap
    const preview = await calculateSwapPreview(fromCurrency, toCurrency, parseAmount);
    const swapRef = `swap_${uuidv4().substring(0, 8)}`;

    // Try atomic RPC first
    const { data: rpcResult, error: rpcError } = await supabase.rpc('execute_swap', {
        p_user_id: userId,
        p_from_wallet_id: fromWallet.id,
        p_to_wallet_id: toWallet.id,
        p_from_currency: fromCurrency,
        p_to_currency: toCurrency,
        p_amount_in: parseAmount,
        p_amount_out: preview.amountOut,
        p_fee: preview.fee,
        p_rate: preview.rate,
        p_reference: swapRef
    });

    if (rpcError) {
        console.log('RPC not available, using manual swap:', rpcError.message);
        
        // Manual swap (less atomic, but works without RPC)
        // 1. Debit source wallet
        const newFromBalance = parseFloat(fromWallet.balance) - parseAmount;
        const { error: debitErr } = await supabase
            .from('wallets')
            .update({ balance: newFromBalance })
            .eq('id', fromWallet.id);

        if (debitErr) throw debitErr;

        // 2. Credit destination wallet
        const newToBalance = parseFloat(toWallet.balance) + preview.amountOut;
        const { error: creditErr } = await supabase
            .from('wallets')
            .update({ balance: newToBalance })
            .eq('id', toWallet.id);

        if (creditErr) {
            // Rollback source wallet
            await supabase
                .from('wallets')
                .update({ balance: fromWallet.balance })
                .eq('id', fromWallet.id);
            throw creditErr;
        }

        // 3. Record transactions
        await supabase.from('transactions').insert([
            {
                wallet_id: fromWallet.id,
                type: 'SWAP',
                amount: parseAmount,
                currency: fromCurrency,
                status: 'COMPLETED',
                reference_id: swapRef,
                fee: preview.fee,
                metadata: {
                    direction: 'OUT',
                    swapTo: toCurrency,
                    rate: preview.rate,
                    amountReceived: preview.amountOut,
                    idempotencyKey
                }
            },
            {
                wallet_id: toWallet.id,
                type: 'SWAP',
                amount: preview.amountOut,
                currency: toCurrency,
                status: 'COMPLETED',
                reference_id: swapRef,
                fee: 0,
                metadata: {
                    direction: 'IN',
                    swapFrom: fromCurrency,
                    rate: preview.rate,
                    amountSent: parseAmount,
                    idempotencyKey
                }
            }
        ]);
    }

    return {
        success: true,
        reference: swapRef,
        fromCurrency,
        toCurrency,
        amountIn: parseAmount,
        amountOut: preview.amountOut,
        fee: preview.fee,
        rate: preview.rate
    };
}

module.exports = {
    getAllExchangeRates,
    calculateSwapPreview,
    executeSwap,
    SWAP_FEE_RATE
};
