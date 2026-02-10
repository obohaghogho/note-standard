/**
 * Deposit Service
 * Handles wallet funding via card (Stripe), bank transfer, and crypto deposits
 */

const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const fxService = require('./fxService');

// Initialize Stripe with secret key
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Client URL for redirects
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5173';

// Currency to Stripe currency code mapping
const STRIPE_CURRENCY_MAP = {
    'USD': 'usd',
    'NGN': 'ngn',
    'EUR': 'eur',
    'GBP': 'gbp',
    'BTC': 'usd', // For crypto, we collect in USD then convert
    'ETH': 'usd',
};

/**
 * Create a card deposit session using Stripe Checkout
 */
async function createCardDeposit(userId, currency, amount) {
    const reference = `card_${uuidv4()}`;
    
    // Get or create wallet
    let { data: wallet } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', userId)
        .eq('currency', currency)
        .single();

    if (!wallet) {
        const { data: newWallet, error: createError } = await supabase
            .from('wallets')
            .insert({
                user_id: userId,
                currency,
                balance: 0,
                address: uuidv4()
            })
            .select()
            .single();
        
        if (createError) throw createError;
        wallet = newWallet;
    }

    // Create pending deposit transaction
    const { error: txError } = await supabase
        .from('transactions')
        .insert({
            wallet_id: wallet.id,
            type: 'DEPOSIT',
            amount: parseFloat(amount),
            currency,
            status: 'PENDING',
            reference_id: reference,
            fee: 0,
            metadata: { method: 'card', user_id: userId }
        });

    if (txError) throw txError;

    // Determine the amount in smallest currency unit (cents for USD, kobo for NGN)
    const stripeCurrency = STRIPE_CURRENCY_MAP[currency] || 'usd';
    let amountInSmallestUnit;
    
    if (stripeCurrency === 'ngn') {
        amountInSmallestUnit = Math.round(parseFloat(amount) * 100); // Kobo
    } else {
        // For crypto currencies, convert to USD equivalent first
        if (currency === 'BTC' || currency === 'ETH') {
            const rate = await fxService.getRate(currency, 'USD');
            const usdAmount = parseFloat(amount) * rate;
            amountInSmallestUnit = Math.round(usdAmount * 100);
        } else {
            amountInSmallestUnit = Math.round(parseFloat(amount) * 100); // Cents
        }
    }

    try {
        // Create Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            mode: 'payment',
            line_items: [{
                price_data: {
                    currency: stripeCurrency,
                    product_data: {
                        name: `Wallet Deposit - ${currency}`,
                        description: `Fund your ${currency} wallet`,
                    },
                    unit_amount: amountInSmallestUnit,
                },
                quantity: 1,
            }],
            metadata: {
                reference: reference,
                user_id: userId,
                wallet_id: wallet.id,
                currency: currency,
                amount: amount.toString(),
            },
            success_url: `${CLIENT_URL}/payment/success?reference=${reference}&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${CLIENT_URL}/payment/cancel?reference=${reference}`,
            expires_at: Math.floor(Date.now() / 1000) + (30 * 60), // 30 minutes expiry
        });

        console.log(`[DepositService] Created Stripe session ${session.id} for reference ${reference}`);

        return {
            reference,
            checkoutUrl: session.url,
            sessionId: session.id,
            amount,
            currency
        };
    } catch (stripeError) {
        // Mark transaction as failed
        await supabase
            .from('transactions')
            .update({ status: 'FAILED', metadata: { method: 'card', error: stripeError.message } })
            .eq('reference_id', reference);
        
        console.error('[DepositService] Stripe session creation failed:', stripeError);
        throw new Error(`Payment initialization failed: ${stripeError.message}`);
    }
}

/**
 * Create a bank transfer deposit
 * For NGN: In production, integrate with Paystack/Flutterwave for virtual accounts
 * For USD: Provide static bank details with unique reference
 */
async function createBankDeposit(userId, currency, amount) {
    const reference = `bank_${uuidv4().substring(0, 8).toUpperCase()}`;
    
    // Get or create wallet
    let { data: wallet } = await supabase
        .from('wallets')
        .select('id')
        .eq('user_id', userId)
        .eq('currency', currency)
        .single();

    if (!wallet) {
        const { data: newWallet, error: createError } = await supabase
            .from('wallets')
            .insert({
                user_id: userId,
                currency,
                balance: 0,
                address: uuidv4()
            })
            .select()
            .single();
        
        if (createError) throw createError;
        wallet = newWallet;
    }

    // Create pending deposit transaction
    const { error: txError } = await supabase
        .from('transactions')
        .insert({
            wallet_id: wallet.id,
            type: 'DEPOSIT',
            amount: parseFloat(amount),
            currency,
            status: 'PENDING',
            reference_id: reference,
            fee: 0,
            metadata: { method: 'bank', user_id: userId }
        });

    if (txError) throw txError;

    // Bank details - In production, use Paystack virtual accounts for NGN
    const bankDetails = {
        NGN: {
            bankName: 'Paystack-Titan MFB',
            accountNumber: '9901234567', // This would be dynamically generated by Paystack
            accountName: 'NoteStandard / ' + reference,
            reference,
            note: 'Transfer exactly the amount shown. Include the reference in your transfer description.'
        },
        USD: {
            bankName: 'Chase Bank',
            routingNumber: '021000021',
            accountNumber: '9876543210',
            accountName: 'NoteStandard Inc',
            reference,
            swiftCode: 'CHASUS33',
            note: 'Include the reference in your wire transfer memo.'
        }
    };

    console.log(`[DepositService] Created bank deposit ${reference} for ${amount} ${currency}`);

    return {
        reference,
        amount,
        currency,
        bankDetails: bankDetails[currency] || bankDetails.USD,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
    };
}

/**
 * Get or generate crypto deposit address
 */
async function getCryptoDepositAddress(userId, currency) {
    // Get wallet
    let { data: wallet } = await supabase
        .from('wallets')
        .select('id, address')
        .eq('user_id', userId)
        .eq('currency', currency)
        .single();

    if (!wallet) {
        // Create wallet with generated address
        const address = generateCryptoAddress(currency);
        const { data: newWallet, error } = await supabase
            .from('wallets')
            .insert({
                user_id: userId,
                currency,
                balance: 0,
                address
            })
            .select()
            .single();
        
        if (error) throw error;
        wallet = newWallet;
    }

    return {
        currency,
        address: wallet.address,
        network: getNetworkName(currency),
        minDeposit: getMinDeposit(currency)
    };
}

/**
 * Confirm a deposit (called by webhook or admin)
 * Includes idempotency check to prevent double-crediting
 */
async function confirmDeposit(reference, externalHash = null) {
    console.log(`[DepositService] Confirming deposit ${reference}`);

    const { data: tx, error: findError } = await supabase
        .from('transactions')
        .select('*, wallet:wallets(id, user_id, balance, currency)')
        .eq('reference_id', reference)
        .single();

    if (findError || !tx) {
        console.error(`[DepositService] Transaction not found: ${reference}`);
        throw new Error('Deposit transaction not found');
    }

    // IDEMPOTENCY CHECK: If already completed, return success without double-crediting
    if (tx.status === 'COMPLETED') {
        console.log(`[DepositService] Transaction ${reference} already completed (idempotent)`);
        return { 
            success: true, 
            amount: tx.amount, 
            currency: tx.currency,
            alreadyProcessed: true 
        };
    }

    // If failed, don't allow confirmation
    if (tx.status === 'FAILED') {
        throw new Error('Cannot confirm a failed transaction');
    }

    // Try atomic update via RPC
    const { error: rpcError } = await supabase.rpc('confirm_deposit', {
        p_transaction_id: tx.id,
        p_wallet_id: tx.wallet_id,
        p_amount: tx.amount,
        p_external_hash: externalHash
    });

    if (rpcError) {
        console.log(`[DepositService] RPC not available, using fallback: ${rpcError.message}`);
        
        // Fallback: Manual update (less atomic, but works without RPC)
        const newBalance = parseFloat(tx.wallet.balance) + parseFloat(tx.amount);
        
        const { error: balanceError } = await supabase
            .from('wallets')
            .update({ 
                balance: newBalance,
                updated_at: new Date().toISOString()
            })
            .eq('id', tx.wallet_id);

        if (balanceError) {
            console.error(`[DepositService] Failed to update balance:`, balanceError);
            throw new Error('Failed to credit wallet');
        }

        const { error: txUpdateError } = await supabase
            .from('transactions')
            .update({ 
                status: 'COMPLETED', 
                external_hash: externalHash,
                updated_at: new Date().toISOString()
            })
            .eq('id', tx.id);

        if (txUpdateError) {
            console.error(`[DepositService] Failed to update transaction:`, txUpdateError);
            // Balance was already updated, log this discrepancy
        }
    }

    console.log(`[DepositService] Successfully confirmed deposit ${reference}: ${tx.amount} ${tx.currency}`);

    return { 
        success: true, 
        amount: tx.amount, 
        currency: tx.currency,
        walletId: tx.wallet_id
    };
}

/**
 * Mark a deposit as failed
 */
async function failDeposit(reference, reason = 'Payment failed') {
    console.log(`[DepositService] Failing deposit ${reference}: ${reason}`);

    const { error } = await supabase
        .from('transactions')
        .update({ 
            status: 'FAILED',
            metadata: { failReason: reason },
            updated_at: new Date().toISOString()
        })
        .eq('reference_id', reference)
        .eq('status', 'PENDING'); // Only fail pending transactions

    if (error) {
        console.error(`[DepositService] Failed to mark deposit as failed:`, error);
    }

    return { success: true };
}

/**
 * Get deposit status by reference
 */
async function getDepositStatus(reference) {
    const { data: tx, error } = await supabase
        .from('transactions')
        .select('id, status, amount, currency, created_at, updated_at')
        .eq('reference_id', reference)
        .single();

    if (error || !tx) {
        return null;
    }

    return tx;
}

// Helper functions
function generateCryptoAddress(currency) {
    const prefixes = {
        'BTC': 'bc1',
        'ETH': '0x'
    };
    const prefix = prefixes[currency] || '0x';
    const randomPart = uuidv4().replace(/-/g, '').substring(0, 32);
    return `${prefix}${randomPart}`;
}

function getNetworkName(currency) {
    const networks = {
        'BTC': 'Bitcoin Mainnet',
        'ETH': 'Ethereum Mainnet (ERC-20)'
    };
    return networks[currency] || 'Unknown';
}

function getMinDeposit(currency) {
    const mins = {
        'BTC': 0.0001,
        'ETH': 0.001
    };
    return mins[currency] || 0;
}

async function getExchangeRate(from, to) {
    return await fxService.getRate(from, to);
}

module.exports = {
    createCardDeposit,
    createBankDeposit,
    getCryptoDepositAddress,
    confirmDeposit,
    failDeposit,
    getDepositStatus,
    getExchangeRate
};
