import axios from 'axios';
import { API_URL } from '../Config';
import { AuthService } from './AuthService';

export interface TransferRequest {
  recipient_email?: string;
  recipient_username?: string;
  amount: number;
  currency: string;
  description?: string;
}

export class WalletService {
  private static async getHeaders() {
    const token = await AuthService.getToken();
    return {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };
  }

  static async transferInternal(data: TransferRequest): Promise<{ success: boolean; message?: string }> {
    try {
      const headers = await this.getHeaders();
      const response = await axios.post(`${API_URL}/api/wallet/transfer`, data, { headers });
      return { success: true, message: response.data.message };
    } catch (err: any) {
      console.error('[WalletService] Transfer failed:', err);
      return { 
        success: false, 
        message: err?.response?.data?.error || err?.response?.data?.message || 'Transfer failed' 
      };
    }
  }
}
