const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const commissionService = require('../services/commissionService');
const depositService = require('../services/depositService');
const swapService = require('../services/swapService');

// Middleware to ensure user is authenticated
const requireAuth = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) return res.status(401).json({ error: 'Unauthorized' });

        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return res.status(401).json({ error: 'Unauthorized' });

        req.user = user;
        next();
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
};

router.use(requireAuth);

// GET / - Get all wallets with balances
router.get('/', async (req, res) => {
    try {
        const { data: wallets, error } = await supabase
            .from('wallets')
            .select('*')
            .eq('user_id', req.user.id);

        if (error) throw error;
        res.json(wallets || []);
    } catch (err) {
        console.error('Error fetching wallets:', err);
        res.status(500).json({ error: 'Failed to fetch wallets' });
    }
});

// GET /commission-rate - Get current commission rates
router.get('/commission-rate', async (req, res) => {
    const { type, currency } = req.query;
    try {
        const rate = await commissionService.calculateCommission(type || 'TRANSFER_OUT', 1, currency || 'BTC'); 
        // We pass 1 to get the rate logic to run, but we just want the rate field really.
        // Or we can expose a getRate method.
        // For now, let's just return the settings.
        const { data: settings } = await supabase
            .from('commission_settings')
            .select('*')
            .eq('is_active', true)
            .or(`currency.eq.${currency},currency.is.null`);
        
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch rates' });
    }
});

// POST /create - Create a new wallet for a currency
router.post('/create', async (req, res) => {
    const { currency } = req.body;
    if (!currency) return res.status(400).json({ error: 'Currency is required' });

    try {
        // Check if exists
        const { data: existing } = await supabase
            .from('wallets')
            .select('id')
            .eq('user_id', req.user.id)
            .eq('currency', currency)
            .single();

        if (existing) return res.json(existing);

        // Create new
        const { data: wallet, error } = await supabase
            .from('wallets')
            .insert({
                user_id: req.user.id,
                currency: currency,
                balance: 0,
                address: uuidv4() // Placeholder for real address generation
            })
            .select()
            .single();

        if (error) throw error;
        res.json(wallet);
    } catch (err) {
        console.error('Error creating wallet:', err);
        res.status(500).json({ error: 'Failed to create wallet' });
    }
});

// GET /transactions - Get transaction history
router.get('/transactions', async (req, res) => {
    try {
        const userId = req.user?.id;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized', transactions: [] });
        }
        
        // 1. Fetch user's wallets first to confirm they exist
        const { data: wallets, error: walletError } = await supabase
            .from('wallets')
            .select('id, currency')
            .eq('user_id', userId);

        if (walletError) {
            console.error('[Wallet API] Wallet fetch error:', walletError);
            return res.status(200).json({ transactions: [], error: walletError.message });
        }

        // 2. If no wallets found, return empty transactions safely
        if (!wallets || wallets.length === 0) {
            return res.json({ transactions: [] });
        }

        const walletIds = wallets.map(w => w.id);

        // 3. Fetch transactions with correct join syntax: table_name(columns)
        // We use 'wallets' which is the relation/table name matching the reference.
        const { data: txs, error: txError } = await supabase
            .from('transactions')
            .select(`
                *,
                wallet:wallets(currency)
            `)
            .in('wallet_id', walletIds)
            .order('created_at', { ascending: false })
            .limit(100);

        if (txError) {
            console.error('[Wallet API] Transaction fetch error:', txError);
            
            // Critical Fallback: Try without join if join fails (SQL error, relationship mismatch, etc)
            const { data: fallbackTxs, error: fbError } = await supabase
                .from('transactions')
                .select('*')
                .in('wallet_id', walletIds)
                .order('created_at', { ascending: false })
                .limit(100);
            
            if (fbError) {
                console.error('[Wallet API] Critical fetch failure:', fbError);
                return res.status(200).json({ transactions: [] });
            }
            
            return res.json({ transactions: fallbackTxs || [] });
        }

        // Success - wrap in expected response format
        return res.json({ transactions: txs || [] });

    } catch (err) {
        // Absolute fallback to ensure NO 500 errors reach production
        console.error('[Wallet API Crash Protection]:', err);
        return res.json({ 
            transactions: [],
            error: 'An unexpected error occurred while fetching transactions' 
        });
    }
});

// POST /transfer/internal - Internal user-to-user transfer
router.post('/transfer/internal', async (req, res) => {
    const { recipientEmail, amount, currency, recipientId } = req.body;
    
    if ((!recipientEmail && !recipientId) || !amount || !currency) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const transferAmount = parseFloat(amount);

        // 1. Calculate Commission
        const commission = await commissionService.calculateCommission('TRANSFER_OUT', transferAmount, currency);
        const platformWalletId = await commissionService.getPlatformWalletId(currency);

        // 2. Find Sender Wallet
        const { data: senderWallet } = await supabase
            .from('wallets')
            .select('id, balance')
            .eq('user_id', req.user.id)
            .eq('currency', currency)
            .single();

        if (!senderWallet) return res.status(404).json({ error: 'Sender wallet not found' });
        
        // Check balance (Amount + Fee)
        if (parseFloat(senderWallet.balance) < (transferAmount + commission.fee)) {
            return res.status(400).json({ error: `Insufficient funds. Need ${transferAmount + commission.fee} ${currency} (including fee)` });
        }

        // 3. Find Recipient User
        // Use recipientId if provided, simplified.
        const targetUserId = recipientId; // In production resolve email to ID safely
        if (!targetUserId) return res.status(400).json({ error: 'Recipient ID required (resolution not implemented)' });

        // 4. Find/Create Recipient Wallet
        let { data: recipientWallet } = await supabase
            .from('wallets')
            .select('id')
            .eq('user_id', targetUserId)
            .eq('currency', currency)
            .single();

        if (!recipientWallet) {
            // Auto-create wallet for recipient
            const { data: newWallet, error: createError } = await supabase
                .from('wallets')
                .insert({
                    user_id: targetUserId,
                    currency: currency,
                    balance: 0,
                    address: uuidv4()
                })
                .select()
                .single();
            
            if (createError) return res.status(500).json({ error: 'Failed to create recipient wallet' });
            recipientWallet = newWallet;
        }

        // 5. Call Database Function for Atomic Transfer
        const { data: txId, error: txError } = await supabase
            .rpc('transfer_funds', {
                p_sender_wallet_id: senderWallet.id,
                p_receiver_wallet_id: recipientWallet.id,
                p_amount: transferAmount,
                p_currency: currency,
                p_fee: commission.fee,
                p_rate: commission.rate,
                p_platform_wallet_id: platformWalletId,
                p_metadata: req.body.idempotencyKey ? { idempotencyKey: req.body.idempotencyKey } : {}
            });

        if (txError) throw txError;

        res.json({ success: true, transactionId: txId, fee: commission.fee });

    } catch (err) {
        console.error('Transfer error:', err);
        res.status(500).json({ error: err.message || 'Transfer failed' });
    }
});

// POST /withdraw - Withdraw to external/bank
router.post('/withdraw', async (req, res) => {
    const { amount, currency, bankId } = req.body;
    
    if (!amount || !currency) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    try {
        const withdrawAmount = parseFloat(amount);

        // 1. Calculate Commission
        const commission = await commissionService.calculateCommission('WITHDRAWAL', withdrawAmount, currency);
        const platformWalletId = await commissionService.getPlatformWalletId(currency);

        if (!platformWalletId) {
            console.warn(`No platform wallet found for ${currency}. Fee will be burned or transaction failed.`);
            // Decide policy: Fail or Burn? For now, we proceed (fee burned if null)
        }

        // 2. Find User Wallet
        const { data: userWallet } = await supabase
            .from('wallets')
            .select('id, balance')
            .eq('user_id', req.user.id)
            .eq('currency', currency)
            .single();

        if (!userWallet) return res.status(404).json({ error: 'Wallet not found' });
        
        // Check balance
        if (parseFloat(userWallet.balance) < (withdrawAmount + commission.fee)) {
            return res.status(400).json({ error: `Insufficient funds. Need ${withdrawAmount + commission.fee} ${currency}` });
        }

        // 3. Call Withdraw RPC
        const { data: txId, error: txError } = await supabase
            .rpc('withdraw_funds', {
                p_wallet_id: userWallet.id,
                p_amount: withdrawAmount,
                p_currency: currency,
                p_fee: commission.fee,
                p_rate: commission.rate,
                p_platform_wallet_id: platformWalletId,
                p_metadata: { bankId }
            });

        if (txError) throw txError;

        res.json({ success: true, transactionId: txId, fee: commission.fee, netAmount: withdrawAmount });

    } catch (err) {
        console.error('Withdrawal error:', err);
        res.status(500).json({ error: err.message || 'Withdrawal failed' });
    }
});

// ============================================
// DEPOSIT ENDPOINTS
// ============================================

// POST /deposit/card - Create card deposit (Stripe checkout)
router.post('/deposit/card', async (req, res) => {
    const { currency, amount } = req.body;
    
    if (!currency || !amount) {
        return res.status(400).json({ error: 'Currency and amount are required' });
    }

    try {
        const result = await depositService.createCardDeposit(req.user.id, currency, parseFloat(amount));
        res.json(result);
    } catch (err) {
        console.error('Card deposit error:', err);
        res.status(500).json({ error: err.message || 'Failed to create deposit' });
    }
});

// POST /deposit/bank - Create bank transfer deposit
router.post('/deposit/bank', async (req, res) => {
    const { currency, amount } = req.body;
    
    if (!currency || !amount) {
        return res.status(400).json({ error: 'Currency and amount are required' });
    }

    try {
        const result = await depositService.createBankDeposit(req.user.id, currency, parseFloat(amount));
        res.json(result);
    } catch (err) {
        console.error('Bank deposit error:', err);
        res.status(500).json({ error: err.message || 'Failed to create deposit' });
    }
});

// GET /deposit/crypto/:currency - Get crypto deposit address
router.get('/deposit/crypto/:currency', async (req, res) => {
    const { currency } = req.params;
    
    if (!['BTC', 'ETH'].includes(currency)) {
        return res.status(400).json({ error: 'Invalid crypto currency' });
    }

    try {
        const result = await depositService.getCryptoDepositAddress(req.user.id, currency);
        res.json(result);
    } catch (err) {
        console.error('Crypto address error:', err);
        res.status(500).json({ error: err.message || 'Failed to get deposit address' });
    }
});

// POST /deposit/confirm - Confirm a deposit (webhook/admin)
router.post('/deposit/confirm', async (req, res) => {
    const { reference, externalHash } = req.body;
    
    if (!reference) {
        return res.status(400).json({ error: 'Reference is required' });
    }

    try {
        const result = await depositService.confirmDeposit(reference, externalHash);
        res.json(result);
    } catch (err) {
        console.error('Confirm deposit error:', err);
        res.status(500).json({ error: err.message || 'Failed to confirm deposit' });
    }
});

// ============================================
// SWAP ENDPOINTS
// ============================================

// GET /exchange-rates - Get all exchange rates
router.get('/exchange-rates', async (req, res) => {
    try {
        const rates = await swapService.getAllExchangeRates();
        res.json(rates);
    } catch (err) {
        console.error('Exchange rates error:', err);
        res.status(500).json({ error: 'Failed to fetch rates' });
    }
});

// POST /swap/preview - Preview a swap (calculate fees/amounts)
router.post('/swap/preview', async (req, res) => {
    const { fromCurrency, toCurrency, amount } = req.body;
    
    if (!fromCurrency || !toCurrency || !amount) {
        return res.status(400).json({ error: 'fromCurrency, toCurrency, and amount are required' });
    }

    try {
        const preview = swapService.calculateSwapPreview(fromCurrency, toCurrency, parseFloat(amount));
        res.json(preview);
    } catch (err) {
        console.error('Swap preview error:', err);
        res.status(500).json({ error: 'Failed to calculate swap' });
    }
});

// POST /swap/execute - Execute a swap
router.post('/swap/execute', async (req, res) => {
    const { fromCurrency, toCurrency, amount, idempotencyKey } = req.body;
    
    if (!fromCurrency || !toCurrency || !amount) {
        return res.status(400).json({ error: 'fromCurrency, toCurrency, and amount are required' });
    }

    try {
        const result = await swapService.executeSwap(
            req.user.id,
            fromCurrency,
            toCurrency,
            parseFloat(amount),
            idempotencyKey
        );
        res.json(result);
    } catch (err) {
        console.error('Swap execution error:', err);
        res.status(500).json({ error: err.message || 'Swap failed' });
    }
});

module.exports = router;

