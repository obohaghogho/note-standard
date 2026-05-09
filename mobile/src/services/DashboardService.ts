import axios from 'axios';
import { API_URL } from '../Config';
import { AuthService } from './AuthService';

export interface DashboardStats {
  messages: number;
  notes: number;
  calls: number;
  balance: string;
}

export class DashboardService {
  private static async getHeaders() {
    const token = await AuthService.getToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  static async getStats(): Promise<DashboardStats> {
    try {
      const headers = await this.getHeaders();
      
      const [wallets, notes, conversations] = await Promise.all([
        axios.get(`${API_URL}/api/wallets`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/notes`, { headers }).catch(() => ({ data: [] })),
        axios.get(`${API_URL}/api/chat/conversations`, { headers }).catch(() => ({ data: [] })),
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
    } catch (err) {
      console.error('[DashboardService] Failed to fetch stats:', err);
      return { messages: 0, notes: 0, calls: 0, balance: '0.00' };
    }
  }
}
