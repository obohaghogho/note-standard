import api from "./axiosInstance";
import type { Wallet, Transaction, InternalTransferRequest, WithdrawalRequest, CommissionSettings, LedgerEntry, ExchangeRates, CardDepositResponse, BankDepositResponse, CryptoDepositResponse, SwapPreview, SwapResult } from '@/types/wallet';

export const walletApi = {
  // Get all wallets
  async getWallets(): Promise<Wallet[]> {
    const response = await api.get('/wallet');
    return response.data; // Backend returns array directly
  },

  // Create or fetch a wallet
  async createWallet(currency: string, network: string = 'native'): Promise<Wallet> {
    const response = await api.post('/wallet/create', { currency, network });
    return response.data; // Backend returns object directly
  },

  // Internal transfer (Send funds)
  async internalTransfer(data: InternalTransferRequest): Promise<{ success: boolean; transactionId: string; fee: string | number; targetUserId?: string }> {
    const response = await api.post('/wallet/transfer', data);
    return response.data;
  },

  // Withdraw funds
  async withdraw(data: WithdrawalRequest): Promise<{ success: boolean; transactionId: string; fee: number }> {
    const response = await api.post('/wallet/withdraw', data);
    return response.data;
  },

  // Get transaction history
  async getTransactions(params: { 
    page?: number; 
    limit?: number; 
    currency?: string;
    status?: string;
    type?: string; 
  } = {}): Promise<{ 
    transactions: Transaction[], 
    total?: number, 
    pagination?: { 
        page: number, 
        limit: number, 
        totalCount: number, 
        hasMore: boolean 
    } 
  }> {
    const response = await api.get('/wallet/transactions', { params });
    return response.data;
  },

  // Get commission rates
  async getCommissionRate(type: 'swap' | 'withdrawal' | 'deposit', currency: string): Promise<CommissionSettings[]> {
    const response = await api.get('/wallet/commissions', { 
        params: { type, currency } 
    });
    return response.data.commissions;
  },

  // Get exchange rates
  async getExchangeRates(): Promise<ExchangeRates> {
    const response = await api.get('/wallet/exchange-rates');
    return response.data;
  },

  // Get current address (for ReceiveModal)
  async getCurrentAddress(currency: string, network: string = 'native'): Promise<{ address: string }> {
      const response = await api.get('/wallet/address', { 
          params: { currency, network } 
      });
      return response.data;
  },

  // Generate new address
  async generateNewAddress(currency: string, network: string = 'native'): Promise<{ address: string }> {
      const response = await api.post('/wallet/address', { currency, network });
      return response.data;
  },

  // Unified payment initialization (for FundModal crypto/etc)
  async initializePayment(data: { 
      amount: number, 
      currency: string, 
      provider?: string,
      targetCurrency?: string,
      targetNetwork?: string
  }): Promise<CardDepositResponse | BankDepositResponse | CryptoDepositResponse> {
      const response = await api.post('/wallet/deposit', data);
      return response.data;
  },

  // Check deposit/payment status
  async checkPaymentStatus(reference: string): Promise<{ status: string; amount: number; currency: string; [key: string]: unknown }> {
      const response = await api.get('/wallet/deposit/status', {
          params: { reference }
      });
      return response.data;
  },

  // Proactively verify payment status with external providers (Truth anchor polling)
  async proactiveVerifyPayment(reference: string, transactionId?: string): Promise<{ success: boolean; status: string; data?: unknown }> {
      const response = await api.get(`/webhooks/status/${reference}`, {
          params: { transaction_id: transactionId }
      });
      
      // Unwrap the nested data envelope for legacy compatibility with UI components
      if (response.data && response.data.success) {
          return {
              success: true,
              status: response.data.status,
              ...response.data
          };
      }
      return response.data;
  },

  // Trigger an explicit Paystack API verification (rate-limited server-side to 1/15s).
  // Use this every ~20s during polling and on manual "Verify Now" user action.
  async triggerVerification(reference: string): Promise<{ success: boolean; status: string; amount?: number; currency?: string; rateLimited?: boolean }> {
      const response = await api.post(`/transactions/verify/${reference}`);
      if (response.data && response.data.success) {
          return {
              success: true,
              status: response.data.data.status,
              amount: response.data.data.amount,
              currency: response.data.data.currency,
              rateLimited: response.data.data.rateLimited ?? false
          };
      }
      return { success: false, status: 'PENDING' };
  },


  // Card Deposit Initialization (Match UI signature)
  async depositCard(data: { 
      amount: number, 
      currency: string, 
      network?: string,
      toCurrency?: string,
      toNetwork?: string
  }): Promise<CardDepositResponse> {
      const response = await api.post('/wallet/deposit/card', data);
      return response.data;
  },

  async depositTransfer(data: { 
      amount: number, 
      currency: string, 
      network?: string,
      toCurrency?: string,
      toNetwork?: string
  }): Promise<BankDepositResponse> {
      const response = await api.post('/wallet/deposit/transfer', data);
      return response.data;
  },

  // Submit proof of payment for manual bank deposit
  async submitDepositProof(data: {
      reference: string,
      proof_url: string
  }): Promise<{ success: boolean; message: string }> {
      const response = await api.post('/wallet/deposit/submit-proof', data);
      return response.data;
  },
  
  // Ledger History
  async getLedgerEntries(params?: {
      limit?: number;
      offset?: number;
      currency?: string;
  }): Promise<{ entries: LedgerEntry[], total: number }> {
      const response = await api.get('/wallet/ledger', { params });
      return response.data;
  },

  // Swap Preview
  async previewSwap(from: string, to: string, amount: number, slippage: number, fromNetwork: string = 'native', toNetwork: string = 'native'): Promise<SwapPreview> {
      const response = await api.post('/wallet/swap/preview', { from, to, amount, slippage, fromNetwork, toNetwork });
      return response.data;
  },

  // Execute Swap
  async executeSwap(from: string, to: string, amount: number, idempotencyKey: string, lockId: string, slippage: number, fromNetwork: string = 'native', toNetwork: string = 'native', captchaToken?: string): Promise<SwapResult> {
      const response = await api.post('/wallet/swap', { from, to, amount, idempotencyKey, lockId, slippage, fromNetwork, toNetwork, captchaToken });
      return response.data;
  },

  // Download Transaction Receipt (PDF)
  async downloadInvoice(txId: string): Promise<void> {
      const response = await api.get(`/wallet/transactions/${txId}/receipt`, {
          responseType: 'blob'
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `Receipt_${txId.substring(0, 8)}.pdf`);
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      link.remove();
  },

  // Request a limit increase
  async createLimitRequest(data: { requested_limit: number, reason: string }): Promise<{ success: boolean; message: string; request?: Record<string, unknown> }> {
    const response = await api.post('/wallet/limit-request', data);
    return response.data;
  },

  // Bank Account Management
  async saveBankAccount(data: {
    currency: string;
    account_holder: string;
    account_number: string;
    iban?: string;
    swift_code?: string;
    sort_code?: string;
    wire_routing?: string;
    ach_routing?: string;
    bank_name: string;
    bank_address: string;
    payment_schemes?: string[];
    fees?: Record<string, string>;
    geo_restriction?: string;
  }): Promise<{
    currency: string;
    account_holder: string;
    account_number: string;
    iban_last4?: string;
    bank_name: string;
    payment_schemes: string[];
    settlement_info: string;
  }> {
    const response = await api.post('/bank-account', data);
    return response.data;
  },

  async getBankAccount(currency: string = 'USD', signal?: AbortSignal): Promise<{
    currency: string;
    account_holder: string;
    account_number: string;
    iban_last4?: string;
    bank_name: string;
    payment_schemes: string[];
    settlement_info: string;
  } | null> {
    // Server returns 200 in both cases:
    //   • Account exists  → { currency, account_holder, ... }  (found: true)
    //   • No account yet  → { data: null, found: false }        (new user, normal state)
    // This eliminates browser-console 404 noise for new users.
    const response = await api.get('/bank-account', {
      params: { currency },
      signal,
    });
    // Handle the "no account yet" envelope
    if (response.data?.found === false || response.data?.data === null) return null;
    return response.data;
  },

  // ── Wallet Hub API ────────────────────────────────────────────────────────

  /** GET /wallet/hub — combined fiat wallets + crypto wallets + catalog + recent activity */
  async getHubView(): Promise<{
    fiatWallets: any[];
    cryptoWallets: any[];
    portfolio: any;
    currencyCatalog: { fiat: any[]; crypto: any[] };
    recentActivity: any[];
  }> {
    try {
      const response = await api.get('/wallet/hub');
      return response.data;
    } catch {
      // Graceful fallback: use the existing endpoints individually
      const [wallets, rates] = await Promise.all([
        api.get('/wallet'),
        api.get('/wallet/exchange-rates').catch(() => ({ data: { rates: {} } })),
      ]);
      const allWallets: any[] = wallets.data || [];
      const fiatCodes = ['NGN', 'USD', 'EUR', 'GBP'];
      const cryptoCodes = ['BTC', 'ETH', 'USDT', 'USDC'];
      return {
        fiatWallets: allWallets.filter(w => fiatCodes.includes(w.currency?.toUpperCase())),
        cryptoWallets: allWallets.filter(w => cryptoCodes.includes(w.currency?.toUpperCase())),
        portfolio: null,
        currencyCatalog: { fiat: [], crypto: [] },
        recentActivity: [],
      };
    }
  },

  /** GET /wallet/currencies — DB-first currency catalog with statuses */
  async getCurrencies(): Promise<{ fiat: any[]; crypto: any[] }> {
    try {
      const response = await api.get('/wallet/currencies');
      return response.data;
    } catch {
      return { fiat: [], crypto: [] };
    }
  },

  /** GET /wallet/portfolio — portfolio summary with 24h change */
  async getPortfolioSummary(): Promise<any> {
    try {
      const response = await api.get('/wallet/portfolio');
      return response.data;
    } catch {
      return null;
    }
  },

  /** POST /wallet/internal-transfer — move funds between own wallets */
  async walletInternalTransfer(data: {
    fromCurrency: string;
    toCurrency: string;
    amount: number;
    idempotencyKey: string;
  }): Promise<any> {
    const response = await api.post('/wallet/internal-transfer', data);
    return response.data;
  },

  /** Convenience shorthand for getLedgerEntries (used by RecentActivity) */
  async getLedger(limit = 20): Promise<{ entries: any[] }> {
    const response = await api.get('/wallet/ledger', { params: { limit } });
    return response.data;
  },

  /**
   * Hub-friendly swap preview — accepts object instead of positional args.
   * Wraps the existing previewSwap endpoint.
   */
  async previewSwapHub(data: {
    fromCurrency: string;
    toCurrency: string;
    amount: number;
    slippage?: number;
  }): Promise<any> {
    const response = await api.post('/wallet/swap/preview', {
      from: data.fromCurrency,
      to: data.toCurrency,
      amount: data.amount,
      slippage: data.slippage ?? 0.005,
    });
    return response.data;
  },

  /**
   * Hub-friendly swap execute — accepts object instead of positional args.
   * Wraps the existing executeSwap endpoint.
   */
  async executeSwapHub(data: { lockId: string; idempotencyKey: string }): Promise<any> {
    const response = await api.post('/wallet/swap', {
      lockId: data.lockId,
      idempotencyKey: data.idempotencyKey,
    });
    return response.data;
  },

  /** GET /wallet/virtual-account/:currency — fetch dedicated virtual account */
  async getVirtualAccount(currency: string): Promise<{ account: any | null; status: string }> {
    const response = await api.get(`/wallet/virtual-account/${encodeURIComponent(currency)}`);
    return response.data;
  },

  /** POST /wallet/virtual-account — provision new dedicated virtual account */
  async createVirtualAccount(currency: string, kycData?: any): Promise<{ success: boolean; account: any }> {
    const response = await api.post('/wallet/virtual-account', {
      currency,
      kycData,
    });
    return response.data;
  },

  /** POST /wallet/virtual-account/:currency/refresh — sync virtual account status */
  async refreshVirtualAccount(currency: string): Promise<{ success: boolean; account: any }> {
    const response = await api.post(`/wallet/virtual-account/${encodeURIComponent(currency)}/refresh`);
    return response.data;
  },
};

export default walletApi;
