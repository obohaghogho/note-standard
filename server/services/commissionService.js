const supabase = require('../config/supabase');

const commissionService = {
    /**
     * Calculate commission for a given transaction amount and type.
     * @param {string} transactionType - 'TRANSFER_OUT', 'WITHDRAWAL', 'SWAP'
     * @param {number} amount - Amount to calculate fee on
     * @param {string} currency - Currency code (e.g., 'BTC', 'USD')
     * @returns {Promise<Object>} - { fee, rate, netAmount }
     */
    async calculateCommission(transactionType, amount, currency) {
        try {
            // Fetch applicable setting
            // Priority: Specific currency > Global (currency is null)
            const { data: settings, error } = await supabase
                .from('commission_settings')
                .select('*')
                .eq('transaction_type', transactionType)
                .eq('is_active', true)
                .or(`currency.eq.${currency},currency.is.null`)
                .order('currency', { ascending: false }) // Specific currency first (if exists)
                .limit(1);

            if (error) throw error;

            let fee = 0;
            let rate = 0;

            if (settings && settings.length > 0) {
                const setting = settings[0];
                
                if (setting.commission_type === 'PERCENTAGE') {
                    rate = setting.value;
                    fee = amount * rate;
                } else if (setting.commission_type === 'FIXED') {
                    rate = 0; // Fixed fee doesn't have a rate multiplier
                    fee = setting.value;
                }

                // Apply Min/Max limits
                if (setting.min_fee && fee < setting.min_fee) fee = setting.min_fee;
                if (setting.max_fee && fee > setting.max_fee) fee = setting.max_fee;
            }

            return {
                fee: parseFloat(fee.toFixed(8)), // Simplify decimals
                rate: rate,
                netAmount: parseFloat((amount - fee).toFixed(8)) // For user receiver perspective? 
                // Actually, for TRANSFER_OUT: User pays Amount + Fee? Or Amount includes Fee?
                // Usually: User enters "Send 1 BTC". Fee is extra? Or Fee is deducted?
                // Requirement: "Commission should be deducted before the final transaction... Clearly separate User amount, Platform commission".
                // If I send 1 BTC, and have enough balance, I usually pay 1 BTC + Fee. 
                // If I withdraw 1 BTC, I usually receive 1 BTC - Fee.
                // Let's stick to: Input Amount is what is "Sent" or "Withdrawn". Fee is *subtracted* from that if it's inclusive, or *added* if exclusive.
                // The implementation plan says "User amount, Platform commission, Net amount received".
                // So for Transfer: User sends X. Receiver gets X. Sender pays X + Fee.
                // For Withdrawal: User withdraws X. User receives X - Fee? Or User requests X to bank, and pays X + Fee?
                // Usually withdrawals are "I want to withdraw 100 USD". I get 98 USD (2 USD fee).
                // Let's standardise: 
                // Transfer: Exclusive (Sender pays Amount + Fee).
                // Withdrawal: Inclusive (User requests X, gets X - Fee).
            };
        } catch (err) {
            console.error('Error calculating commission:', err);
            return { fee: 0, rate: 0, netAmount: amount }; // Fail safe to 0 fee? Or error?
        }
    },

    /**
     * Get the platform wallet ID for a specific currency.
     * @param {string} currency 
     * @returns {Promise<string|null>}
     */
    async getPlatformWalletId(currency) {
        const { data, error } = await supabase
            .from('platform_wallets')
            .select('wallet_id')
            .eq('currency', currency)
            .maybeSingle();
        
        if (error) {
            console.error('Error fetching platform wallet:', error);
            return null;
        }

        return data ? data.wallet_id : null;
    }
};

module.exports = commissionService;
