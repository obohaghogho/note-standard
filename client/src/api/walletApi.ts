import { supabase } from '../lib/supabaseSafe';
import type { Wallet, Transaction, InternalTransferRequest, WithdrawalRequest, CommissionSettings, LedgerEntry } from '@/types/wallet';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';
const API_BASE = `${API_URL}/api`;

async function getAuthHeader(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${session?.access_token || ''}`
  };
}

export const walletApi = {
  // Get all wallets
  async getWallets(): Promise<Wallet[]> {
    try {
      const headers = await getAuthHeader();
      const response = await fetch(`${API_BASE}/wallet`, { headers });
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('getWallets error:', error);
      return [];
    }
  },

  // Create a new wallet
  async createWallet(currency: string, network: string = 'native'): Promise<Wallet> {
    const headers = await getAuthHeader();
    const response = await fetch(`${API_BASE}/wallet/create`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ currency, network })
    });
    if (!response.ok) throw new Error('Failed to create wallet');
    return response.json();
  },

  // Get transaction history (Paginated)
  async getTransactions(page: number = 1, limit: number = 20): Promise<{ transactions: Transaction[], total: number, page: number, limit: number, hasMore: boolean }> {
    try {
      const headers = await getAuthHeader();
      const response = await fetch(`${API_BASE}/wallet/transactions?page=${page}&limit=${limit}`, { headers });
      if (!response.ok) return { transactions: [], total: 0, page, limit, hasMore: false };
      const data = await response.json();
      
      const transactions = data.transactions || [];
      const pagination = data.pagination || {};

      return {
        transactions: Array.isArray(transactions) ? transactions : [],
        total: pagination.totalCount ?? transactions.length,
        page: pagination.page ?? page,
        limit: pagination.limit ?? limit,
        hasMore: pagination.hasMore ?? false
      };
    } catch (error) {
      console.error('getTransactions error:', error);
      return { transactions: [], total: 0, page, limit, hasMore: false };
    }
  },

  async internalTransfer(data: InternalTransferRequest & { captchaToken?: string }): Promise<{ success: boolean; transactionId: string }> {
    const headers = await getAuthHeader();
    const response = await fetch(`${API_BASE}/wallet/transfer`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Transfer failed');
    return result;
  },

  async withdraw(data: WithdrawalRequest & { captchaToken?: string }): Promise<{ success: boolean; transactionId: string; fee: number; netAmount: number }> {
    const headers = await getAuthHeader();
    const response = await fetch(`${API_BASE}/wallet/withdraw`, {
      method: 'POST',
      headers,
      body: JSON.stringify(data)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Withdrawal failed');
    return result;
  },

  async getCommissionRate(type: string, currency: string): Promise<CommissionSettings[]> {
    const headers = await getAuthHeader();
    // Assuming we might want to standardize this too, but for now leaving as is or moving to /api/wallet
    const response = await fetch(`${API_BASE}/wallet/commission-rate?type=${type}&currency=${currency}`, { headers });
    if (!response.ok) return [];
    return response.json();
  },

  // ========================================
  // SWAP METHODS
  // ========================================

  async getExchangeRates(): Promise<Record<string, Record<string, number>>> {
    const headers = await getAuthHeader();
    const response = await fetch(`${API_BASE}/wallet/exchange-rates`, { headers });
    if (!response.ok) return {};
    return response.json();
  },

  async previewSwap(fromCurrency: string, toCurrency: string, amount: number, slippageTolerance?: number, fromNetwork?: string, toNetwork?: string): Promise<any> {
    const headers = await getAuthHeader();
    const response = await fetch(`${API_BASE}/wallet/swap/preview`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fromCurrency, toCurrency, amount, slippageTolerance, fromNetwork, toNetwork })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Swap preview failed');
    return result;
  },

  async executeSwap(fromCurrency: string, toCurrency: string, amount: number, idempotencyKey: string, lockId: string, slippageTolerance?: number, fromNetwork?: string, toNetwork?: string, captchaToken?: string): Promise<any> {
    const headers = await getAuthHeader();
    const response = await fetch(`${API_BASE}/wallet/swap`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ fromCurrency, toCurrency, amount, idempotencyKey, lockId, slippageTolerance, fromNetwork, toNetwork, captchaToken })
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Swap execution failed');
    return result;
  },

  async downloadInvoice(transactionId: string): Promise<void> {
    const headers = await getAuthHeader();
    const response = await fetch(`${API_BASE}/wallet/transactions/${transactionId}/invoice`, { headers });
    if (!response.ok) throw new Error('Failed to download invoice');
    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `invoice_${transactionId.substring(0, 8)}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  },

  async getLedgerEntries(limit: number = 10): Promise<LedgerEntry[]> {
    try {
      const headers = await getAuthHeader();
      const response = await fetch(`${API_BASE}/wallet/ledger?limit=${limit}`, { headers });
      if (!response.ok) throw new Error('Failed to fetch ledger');
      const data = await response.json();
      return (data.entries || []) as LedgerEntry[];
    } catch (error) {
      console.error('getLedgerEntries error:', error);
      return [];
    }
  },

  async getCurrentAddress(currency: string, network: string = 'native'): Promise<{ address: string; currency: string; network: string }> {
    const headers = await getAuthHeader();
    const response = await fetch(`${API_BASE}/wallet/address?currency=${currency}&network=${network}`, { headers });
    if (!response.ok) throw new Error('Failed to fetch address');
    return response.json();
  },

  async generateNewAddress(currency: string, network: string = 'native'): Promise<{ address: string; currency: string; network: string }> {
    const headers = await getAuthHeader();
    // For now, we reuse the address retrieval logic which generates if not exists
    // In a full HD implementation, this would trigger a new index increment on the backend
    const response = await fetch(`${API_BASE}/wallet/address?currency=${currency}&network=${network}&rotate=true`, { 
      method: 'POST',
      headers 
    });
    if (!response.ok) throw new Error('Failed to generate new address');
    return response.json();
  }
};
