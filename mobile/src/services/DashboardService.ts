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

      const walletData = results[0].status === 'fulfilled' ? results[0].value?.data : null;
      const walletList = Array.isArray(walletData) ? walletData : (walletData?.wallets || []);
      const notes = results[1].status === 'fulfilled' ? results[1].value?.data : [];
      const conversations = results[2].status === 'fulfilled' ? results[2].value?.data : [];

      if (results[0].status === 'rejected') console.error('[DashboardService] Wallet fetch failed:', results[0].reason);
      if (results[1].status === 'rejected') console.error('[DashboardService] Notes fetch failed:', results[1].reason);
      if (results[2].status === 'rejected') console.error('[DashboardService] Conversations fetch failed:', results[2].reason);

      const mainWallet = walletList.find((w: any) => parseFloat(w.balance) > 0) || walletList[0];
      const balanceStr = mainWallet ? `${parseFloat(mainWallet.balance || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })} ${mainWallet.currency}` : '$0.00';

      return {
        messages: Array.isArray(conversations) ? conversations.length : 0,
        notes: Array.isArray(notes) ? notes.length : 0,
        calls: 0,
        balance: balanceStr
      };
    } catch (err: any) {
      console.error('[DashboardService] Failed to fetch stats:', err?.message || err);
      return { messages: 0, notes: 0, calls: 0, balance: '$0.00' };
    }
  }
}
