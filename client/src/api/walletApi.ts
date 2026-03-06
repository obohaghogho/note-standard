import { v4 as uuidv4 } from "uuid";
import { supabase } from '../lib/supabaseSafe';
import type { Wallet, Transaction, InternalTransferRequest, WithdrawalRequest, CommissionSettings, LedgerEntry } from '@/types/wallet';

// -----------------------------
// Mock Wallet Data (in-memory for dev)
// -----------------------------
const mockWallets: Record<string, Record<string, number>> = {
  user1: {
    USD: 1000,
    BTC: 0.01,
    ETH: 0.1,
    USDT: 100,
    USDC: 50,
  },
};

const ledgerEntries: Record<string, any[]> = {
  user1: [],
};

// -----------------------------
// Exchange Rate Cache
// -----------------------------
const rateCache: Record<string, { rate: number; timestamp: number }> = {};
const CACHE_TTL = 60 * 1000; // 60s cache

// Helper to get consistent userId
async function getMockUserId(): Promise<string> {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user?.id || 'user1';
}

export const walletApi = {
  // Get all wallets (mapped to mock balances)
  async getWallets(): Promise<Wallet[]> {
    const userId = await getMockUserId();
    const balances = mockWallets[userId] || mockWallets['user1'];
    return Object.entries(balances).map(([currency, balance]) => ({
        id: uuidv4(),
        user_id: userId,
        currency,
        balance: balance as number,
        available_balance: balance as number,
        network: 'native',
        address: `${currency}_ADDR_${(userId || 'user1').slice(0, 8)}`,
        provider: 'MOCK_PROVIDER',
        is_frozen: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }));
  },

  // Create or fetch a wallet
  async createWallet(currency: string, network: string = 'native'): Promise<Wallet> {
    const userId = await getMockUserId();
    if (!mockWallets[userId]) mockWallets[userId] = {};
    if (mockWallets[userId][currency] === undefined) {
        mockWallets[userId][currency] = 0;
    }
    const balance = mockWallets[userId][currency];
    return {
        id: uuidv4(),
        user_id: userId,
        currency,
        balance,
        available_balance: balance,
        network,
        address: `${currency}_ADDR_${userId.slice(0, 8)}`,
        provider: 'MOCK_PROVIDER',
        is_frozen: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };
  },

  // Get transaction history (mapped to ledger)
  async getTransactions(page: number = 1, limit: number = 20): Promise<{ transactions: Transaction[], total: number, page: number, limit: number, hasMore: boolean }> {
    const userId = await getMockUserId();
    const entries = ledgerEntries[userId] || [];
    const start = (page - 1) * limit;
    const paginated = entries.slice(start, start + limit).reverse();

    return {
      transactions: paginated.map(e => ({
          id: e.id,
          wallet_id: 'mock_wallet_id',
          user_id: userId,
          type: e.type,
          amount: e.fromAmount || e.amount || 0,
          currency: e.fromCurrency || e.currency || 'USD',
          status: 'COMPLETED',
          fee: e.adminFee || 0,
          created_at: new Date(e.timestamp).toISOString(),
          updated_at: new Date(e.timestamp).toISOString(),
          metadata: e
      })) as any,
      total: entries.length,
      page,
      limit,
      hasMore: entries.length > start + limit
    };
  },

  async internalTransfer(data: InternalTransferRequest & { captchaToken?: string }): Promise<{ success: boolean; transactionId: string }> {
    const userId = await getMockUserId();
    const userWallet = mockWallets[userId];
    if (!userWallet || (userWallet[data.currency] || 0) < data.amount) {
        throw new Error('Insufficient balance');
    }
    
    userWallet[data.currency] -= data.amount;
    const txId = uuidv4();
    const entry = {
        id: txId,
        type: "TRANSFER_OUT",
        currency: data.currency,
        amount: -data.amount,
        recipient: data.recipientAddress || data.recipientEmail,
        timestamp: Date.now(),
    };
    ledgerEntries[userId] = ledgerEntries[userId] || [];
    ledgerEntries[userId].push(entry);

    return { success: true, transactionId: txId };
  },

  async withdraw(data: WithdrawalRequest & { captchaToken?: string }): Promise<{ success: boolean; transactionId: string; fee: number; netAmount: number }> {
    const userId = await getMockUserId();
    const userWallet = mockWallets[userId];
    const fee = 1.0; // Mock fee
    if (!userWallet || (userWallet[data.currency] || 0) < (data.amount + fee)) {
        throw new Error('Insufficient balance');
    }

    userWallet[data.currency] -= (data.amount + fee);
    const txId = uuidv4();
    ledgerEntries[userId] = ledgerEntries[userId] || [];
    ledgerEntries[userId].push({
        id: txId,
        type: "WITHDRAWAL",
        currency: data.currency,
        amount: -data.amount,
        fee,
        destination: data.address || data.account_number,
        timestamp: Date.now(),
    });

    return { success: true, transactionId: txId, fee, netAmount: data.amount };
  },

  async getCommissionRate(type: string, currency: string): Promise<CommissionSettings[]> {
    return [{ 
        transaction_type: type, 
        commission_type: 'PERCENTAGE', 
        value: 0.06, 
        min_fee: 0, 
        max_fee: null, 
        currency 
    }];
  },

  // ========================================
  // SWAP METHODS
  // ========================================

  async getExchangeRates(): Promise<Record<string, number>> {
    const pairs = ["USD/BTC", "USD/ETH", "USD/USDT", "USD/USDC"];
    const rates: Record<string, number> = {};
    const now = Date.now();

    pairs.forEach((pair) => {
      if (rateCache[pair] && now - rateCache[pair].timestamp < CACHE_TTL) {
        rates[pair] = rateCache[pair].rate;
      } else {
        const fallbackRates: Record<string, number> = {
          "USD/BTC": 0.00003,
          "USD/ETH": 0.0005,
          "USD/USDT": 1,
          "USD/USDC": 1,
        };
        const rate = fallbackRates[pair] || 1;
        rates[pair] = rate;
        rateCache[pair] = { rate, timestamp: now };
      }
    });
    return rates;
  },

  async previewSwap(fromCurrency: string, toCurrency: string, amount: number): Promise<any> {
    const rates = await this.getExchangeRates();
    const pair = `${fromCurrency}/${toCurrency}`;
    const rate = rates[pair] || 1;
    return {
        estimatedAmount: amount * rate,
        rate,
        fee: amount * 0.075 // 7.5% total
    };
  },

  async executeSwap(fromCurrency: string, toCurrency: string, amount: number): Promise<any> {
    const userId = await getMockUserId();
    if (!mockWallets[userId]) mockWallets[userId] = { ...mockWallets['user1'] };
    if (amount <= 0) throw new Error("Amount must be positive");

    const userWallet = mockWallets[userId];
    if ((userWallet[fromCurrency] || 0) < amount)
        throw new Error("Insufficient balance");

    const pair = `${fromCurrency}/${toCurrency}`;
    let rate: number;
    const now = Date.now();

    if (rateCache[pair] && now - rateCache[pair].timestamp < CACHE_TTL) {
        rate = rateCache[pair].rate;
    } else {
        const fallbackRates: Record<string, number> = {
            "USD/BTC": 0.00003, "USD/ETH": 0.0005, "USD/USDT": 1, "USD/USDC": 1,
            "BTC/USD": 35000, "ETH/USD": 2000, "USDT/USD": 1, "USDC/USD": 1,
            "BTC/ETH": 15, "ETH/BTC": 0.066, "BTC/USDT": 35000, "USDT/BTC": 0.0000285,
            "ETH/USDT": 2000, "USDT/ETH": 0.0005,
        };
        rate = fallbackRates[pair] || 1;
        rateCache[pair] = { rate, timestamp: now };
    }

    const rawToAmount = amount * rate;
    const adminFee = 0.06 * rawToAmount;
    const referrerFee = 0.005 * rawToAmount;
    const userReward = 0.01 * rawToAmount;
    const finalAmount = rawToAmount - adminFee - referrerFee - userReward;

    userWallet[fromCurrency] -= amount;
    userWallet[toCurrency] = (userWallet[toCurrency] || 0) + finalAmount;

    const txId = uuidv4();
    const entry = {
        id: txId,
        type: "SWAP",
        fromCurrency,
        toCurrency,
        fromAmount: amount,
        toAmount: finalAmount,
        adminFee,
        referrerFee,
        userReward,
        timestamp: Date.now(),
    };
    ledgerEntries[userId] = ledgerEntries[userId] || [];
    ledgerEntries[userId].push(entry);

    return entry;
  },

  async downloadInvoice(transactionId: string): Promise<void> {
    console.log(`Mock invoice download for transaction: ${transactionId}`);
    // No-op for dev mock
  },

  async getLedgerEntries(limit: number = 10): Promise<LedgerEntry[]> {
    const userId = await getMockUserId();
    const entries = ledgerEntries[userId] || [];
    return entries.slice(0, limit).reverse().map(e => ({
        id: e.id,
        user_id: userId,
        wallet_id: 'mock_wallet_id',
        currency: e.currency || e.toCurrency || 'USD',
        amount: e.amount || e.toAmount || 0,
        type: e.type,
        reference: e.id,
        status: 'COMPLETED',
        created_at: new Date(e.timestamp).toISOString()
    }));
  },

  async getCurrentAddress(currency: string, network: string = 'native'): Promise<{ address: string; currency: string; network: string }> {
    const mockAddress = `${currency}_ADDR_${uuidv4().slice(0, 8)}`;
    return { address: mockAddress, currency, network };
  },

  async generateNewAddress(currency: string, network: string = 'native'): Promise<{ address: string; currency: string; network: string }> {
    return this.getCurrentAddress(currency, network);
  },

  async deposit(currency: string, amount: number, userId?: string): Promise<any> {
    const uid = userId || await getMockUserId();
    if (!mockWallets[uid]) mockWallets[uid] = {};
    mockWallets[uid][currency] = (mockWallets[uid][currency] || 0) + amount;

    const entry = {
        id: uuidv4(),
        type: "DEPOSIT",
        currency,
        amount,
        timestamp: Date.now(),
    };
    ledgerEntries[uid] = ledgerEntries[uid] || [];
    ledgerEntries[uid].push(entry);
    return entry;
  }
};
