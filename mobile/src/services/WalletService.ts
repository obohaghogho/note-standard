import apiClient from '../api/apiClient';

export interface TransferRequest {
  recipient_email?: string;
  recipient_username?: string;
  amount: number;
  currency: string;
  description?: string;
}

export class WalletService {
  static async transferInternal(data: TransferRequest): Promise<{ success: boolean; message?: string }> {
    try {
      const response = await apiClient.post(`/wallet/transfer`, data);
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
