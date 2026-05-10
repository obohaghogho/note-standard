import apiClient from '../api/apiClient';

export interface DashboardStats {
  messages: number;
  notes: number;
  calls: number;
  balance: string;
}

export class DashboardService {
  static async getStats(): Promise<DashboardStats> {
    try {
      const [wallets, notes, conversations] = await Promise.all([
        apiClient.get(`/wallet`),
        apiClient.get(`/notes`),
        apiClient.get(`/chat/conversations`),
      ]);

      // Calculate total balance in a primary currency (e.g., USD or NGN)
      // For simplicity, we just sum up the balances if they are all in the same unit, 
      // or just show the first wallet's balance.
      const mainWallet = wallets.data?.[0];
      const balanceStr = mainWallet ? `${mainWallet.balance} ${mainWallet.currency}` : '0.00';

      return {
        messages: conversations.data?.length || 0,
        notes: notes.data?.length || 0,
        calls: 0, // Placeholder for calls
        balance: balanceStr
      };
    } catch (err: any) {
      console.error('[DashboardService] Failed to fetch stats:', err?.message || err);
      return { messages: 0, notes: 0, calls: 0, balance: '0.00' };
    }
  }
}
