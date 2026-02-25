import { API_URL } from './api';
import { supabase } from './supabase';
import type { Wallet, Transaction, InternalTransferRequest, WithdrawalRequest, CommissionSettings } from '@/types/wallet';

const API_base = `${API_URL}/api`;

async function getAuthHeader(): Promise<Record<string, string>> {
    // Try to get session; if expired/null, attempt refresh
    let { data: { session } } = await supabase.auth.getSession();
    
    if (!session?.access_token) {
        // Session may have expired — force a refresh
        console.warn('[walletApi] Session expired or missing, attempting refresh...');
        const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError) {
            console.error('[walletApi] Session refresh failed:', refreshError.message);
        }
        session = refreshData?.session ?? null;
    }

    if (!session?.access_token) {
        console.error('[walletApi] No valid session after refresh. User may need to re-login.');
    }

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
            const response = await fetch(`${API_base}/wallet`, { headers });
            if (!response.ok) {
                console.error('getWallets failed:', response.statusText);
                return [];
            }
            const data = await response.json();
            return Array.isArray(data) ? data : [];
        } catch (error) {
            console.error('getWallets exception:', error);
            return [];
        }
    },

    // Create a new wallet
    async createWallet(currency: string): Promise<Wallet> {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_base}/wallet/create`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ currency })
        });
        if (!response.ok) throw new Error('Failed to create wallet');
        return response.json() as Promise<Wallet>;
    },

    // Get transaction history
    async getTransactions(): Promise<Transaction[]> {
        try {
            const headers = await getAuthHeader();
            const response = await fetch(`${API_base}/wallet/transactions`, { headers });
            if (!response.ok) {
                console.error('getTransactions failed:', response.statusText);
                return [];
            }
            const data = await response.json();
            // Server returns { transactions: [...] } or raw array
            const txs = Array.isArray(data) ? data : (data?.transactions || []);
            return Array.isArray(txs) ? txs : [];
        } catch (error) {
            console.error('getTransactions exception:', error);
            return [];
        }
    },

    async internalTransfer(data: InternalTransferRequest): Promise<{ success: boolean, transactionId: string, fee?: number }> {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_base}/wallet/transfer/internal`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Transfer failed');
        }
        return result;
    },

    // Withdraw
    async withdraw(data: WithdrawalRequest): Promise<{ success: boolean, transactionId: string, fee: number, netAmount: number }> {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_base}/wallet/withdraw`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Withdrawal failed');
        }
        return result;
    },

    // Get Commission Rate
    async getCommissionRate(type: string, currency: string): Promise<CommissionSettings[]> {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_base}/wallet/commission-rate?type=${type}&currency=${currency}`, {
            headers
        });

        if (!response.ok) {
            console.error('Failed to fetch rates');
            return [];
        }
        return response.json();
    },

    // ========================================
    // DEPOSIT METHODS
    // ========================================

    // Create card deposit
    async depositCard(currency: string, amount: number, idempotencyKey?: string): Promise<{ reference: string; checkoutUrl: string; amount: number; currency: string }> {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_base}/wallet/deposit/card`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ currency, amount, idempotencyKey })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Failed to create card deposit');
        }
        return result;
    },

    // Create bank deposit
    async depositBank(currency: string, amount: number, idempotencyKey?: string): Promise<{
        reference: string;
        amount: number;
        currency: string;
        bankDetails: { bankName: string; accountNumber: string; accountName: string; reference: string };
        expiresAt: string;
    }> {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_base}/wallet/deposit/bank`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ currency, amount, idempotencyKey })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Failed to create bank deposit');
        }
        return result;
    },

    // Get crypto deposit address (Legacy/Static)
    async getCryptoDepositAddress(currency: string): Promise<{
        currency: string;
        address: string;
        network: string;
        minDeposit: number;
    }> {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_base}/wallet/deposit/crypto/${currency}`, { headers });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Failed to get deposit address');
        }
        return result;
    },

    // Unified Payment Initialization (New)
    async initializePayment(data: {
        amount: number;
        currency: string;
        metadata?: any;
        options?: { isCrypto?: boolean; [key: string]: any };
    }): Promise<{
        url: string;
        paymentUrl: string;
        payAddress?: string;
        reference: string;
        provider: string;
    }> {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_base}/payment/initialize`, {
            method: 'POST',
            headers,
            body: JSON.stringify(data)
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Payment initialization failed');
        }
        return result;
    },

    // Check payment status
    async checkPaymentStatus(reference: string): Promise<{
        status: string;
        amount: number;
        currency: string;
        provider: string;
    }> {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_base}/payment/status/${reference}`, { headers });

        if (!response.ok) {
            throw new Error('Failed to check payment status');
        }
        return response.json();
    },

    // ========================================
    // SWAP METHODS
    // ========================================

    // Get exchange rates
    async getExchangeRates(): Promise<Record<string, Record<string, number>>> {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_base}/wallet/exchange-rates`, { headers });

        if (!response.ok) {
            console.error('Failed to fetch exchange rates');
            return {};
        }
        return response.json();
    },

    // Preview swap
    async previewSwap(fromCurrency: string, toCurrency: string, amount: number): Promise<{
        fromCurrency: string;
        toCurrency: string;
        amountIn: number;
        rate: number;
        fee: number;
        feePercentage: number;
        amountOut: number;
        netAmount: number;
        lockId: string;
        expiresAt: number;
    }> {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_base}/wallet/swap/preview`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ fromCurrency, toCurrency, amount })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Failed to preview swap');
        }
        return result;
    },

    // Execute swap
    async executeSwap(fromCurrency: string, toCurrency: string, amount: number, idempotencyKey?: string, lockId?: string): Promise<{
        success: boolean;
        reference: string;
        fromCurrency: string;
        toCurrency: string;
        amountIn: number;
        amountOut: number;
        fee: number;
        rate: number;
    }> {
        const headers = await getAuthHeader();
        const response = await fetch(`${API_base}/wallet/swap/execute`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ fromCurrency, toCurrency, amount, idempotencyKey, lockId })
        });

        const result = await response.json();
        if (!response.ok) {
            throw new Error(result.error || 'Swap failed');
        }
        return result;
    },

    // Download Invoice
    async downloadInvoice(transactionId: string): Promise<void> {
        try {
            const headers = await getAuthHeader();
            const response = await fetch(`${API_base}/wallet/transactions/${transactionId}/invoice`, { headers });
            
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
        } catch (error) {
            console.error('Invoice download error:', error);
            throw error;
        }
    }
};

