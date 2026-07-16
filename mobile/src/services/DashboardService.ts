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
      const results = await Promise.allSettled([
        apiClient.get(`/wallet`),
        apiClient.get(`/notes`),
        apiClient.get(`/chat/conversations`),
      ]);

      const wallets = results[0].status === 'fulfilled' ? results[0].value : { data: [] };
      const notes = results[1].status === 'fulfilled' ? results[1].value : { data: [] };
      const conversations = results[2].status === 'fulfilled' ? results[2].value : { data: [] };

      if (results[0].status === 'rejected') console.error('[DashboardService] Wallet fetch failed:', results[0].reason);
      if (results[1].status === 'rejected') console.error('[DashboardService] Notes fetch failed:', results[1].reason);
      if (results[2].status === 'rejected') console.error('[DashboardService] Conversations fetch failed:', results[2].reason);

      const mainWallet = wallets.data?.[0];
      const balanceStr = mainWallet ? `${mainWallet.balance} ${mainWallet.currency}` : '0.00';

      return {
        messages: conversations.data?.length || 0,
        notes: notes.data?.length || 0,
        calls: 0,
        balance: balanceStr
      };
    } catch (err: any) {
      console.error('[DashboardService] Failed to fetch stats:', err?.message || err);
      return { messages: 0, notes: 0, calls: 0, balance: '0.00' };
    }
  }
}
