const supabase = require("../config/database");
const LedgerService = require("./LedgerService");
const FiatWalletService = require("./FiatWalletService");
const CryptoWalletService = require("./CryptoWalletService");
const SystemState = require("../config/SystemState");
const logger = require("../utils/logger");

class TransferService {
    async transferInternal(userId, userPlan, data) {
        if (SystemState.isSafe()) {
            throw new Error("SAFE_MODE_BLOCK: Ledger mutations disabled");
        }

        let { recipientId, recipientEmail, recipientAddress, amount, currency } = data;
        
        if (recipientId) recipientId = String(recipientId).trim();
        if (recipientEmail) recipientEmail = String(recipientEmail).trim();
        if (recipientAddress) recipientAddress = String(recipientAddress).trim();

        const upCurrency = currency.toUpperCase();
        const numAmount = parseFloat(amount);

        // 1. Resolve Recipient Identity
        if (!recipientId && recipientEmail) {
            const { data: profile } = await supabase.from('profiles').select('id').eq('email', recipientEmail.toLowerCase()).maybeSingle();
            if (!profile) throw new Error("Recipient email not found in our system.");
            recipientId = profile.id;
        }

        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(recipientId);
        if (recipientId && !isUUID) {
            const { data: profile } = await supabase.from('profiles').select('id').eq('username', recipientId).maybeSingle();
            if (!profile) throw new Error(`User with username "${recipientId}" not found.`);
            recipientId = profile.id;
        }

        if (!recipientId && recipientAddress) {
            const { data: wallet } = await supabase.from('wallets_store').select('user_id, id').eq('address', recipientAddress).maybeSingle();
            if (!wallet) throw new Error("Recipient wallet address not found.");
            recipientId = wallet.user_id;
        }

        if (!recipientId) throw new Error("Recipient ID, Email, or Wallet Address must be provided.");
        if (userId === recipientId) throw new Error("Cannot transfer to yourself.");

        // 2. Resolve Wallets
        const isCrypto = ["BTC", "ETH", "USDT", "USDC", "TRX", "POLYGON"].includes(upCurrency);
        let senderWallet, recipientWallet;

        if (isCrypto) {
            senderWallet = await CryptoWalletService.createWallet(userId, upCurrency, data.network || "native");
            recipientWallet = await CryptoWalletService.createWallet(recipientId, upCurrency, data.network || "native");
        } else {
            senderWallet = await FiatWalletService.createWallet(userId, upCurrency);
            recipientWallet = await FiatWalletService.createWallet(recipientId, upCurrency);
        }

        // 3. Execute via LedgerService v6
        const idempotencyKey = `transfer_${userId}_to_${recipientId}_${Date.now()}`;
        
        const entries = [
            {
                wallet_id: senderWallet.id,
                user_id: userId,
                currency: upCurrency,
                amount: -numAmount,
                side: 'DEBIT'
            },
            {
                wallet_id: recipientWallet.id,
                user_id: recipientId,
                currency: upCurrency,
                amount: numAmount,
                side: 'CREDIT'
            }
        ];

        logger.info(`[TransferService] Executing internal transfer of ${numAmount} ${upCurrency} from ${userId} to ${recipientId}`);

        const txId = await LedgerService.commitAtomicEvent({
            idempotencyKey,
            type: 'INTERNAL_TRANSFER',
            status: 'SETTLED',
            metadata: { sender: userId, recipient: recipientId },
            entries
        });

        return { 
            success: true, 
            status: 'COMPLETED', 
            transactionId: txId,
            message: "Internal transfer executed instantly."
        };
    }
}

module.exports = new TransferService();
