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

  // Proactively verify payment status with external providers (Webhook trigger substitute)
  async proactiveVerifyPayment(reference: string, transactionId?: string): Promise<{ success: boolean; status: string; data?: unknown }> {
      const response = await api.get(`/webhooks/status/${reference}`, {
          params: { transaction_id: transactionId }
      });
      return response.data;
  },

  // Card Deposit Initialization (Match UI signature)
  async depositCard(data: { 
      amount: number, 
      currency: string, 
      network?: string,
      toCurrency?: string,
      toNetwork?: string
  }): Promise<{ authorization_url?: string, checkoutUrl?: string, reference: string }> {
      const response = await api.post('/wallet/deposit/card', data);
      return response.data;
  },

  // Bank Transfer Deposit Initialization (Match UI signature)
  async depositTransfer(data: { 
      amount: number, 
      currency: string, 
      network?: string,
      toCurrency?: string,
      toNetwork?: string
  }): Promise<{ reference: string, bankDetails: Record<string, unknown> }> {
      const response = await api.post('/wallet/deposit/transfer', data);
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
  }
};

export default walletApi;
