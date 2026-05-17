import { api } from '../lib/api';

export interface ManualWithdrawal {
    id: string;
    user_id: string;
    amount: number;
    currency: string;
    status: string;
    destination: {
        bank_name?: string;
        account_number?: string;
        account_name?: string;
        iban?: string;
        sort_code?: string;
        routing_number?: string;
        swift_code?: string;
    };
    created_at: string;
    profile?: {
        email: string;
        full_name: string;
        username: string;
    };
}

export const payoutApi = {
    /**
     * Fetch pending manual withdrawals (Admin Only)
     */
    getAdminPending: async (): Promise<ManualWithdrawal[]> => {
        const response = await api.get('/api/admin/withdrawals/pending');
        return response.data;
    },

    /**
     * Approve manual withdrawal (Admin Only)
     */
    approve: async (id: string, adminNotes?: string): Promise<void> => {
        await api.put(`/api/admin/withdrawals/${id}/approve`, { adminNotes });
    },

    /**
     * Reject manual withdrawal (Admin Only)
     */
    reject: async (id: string, adminNotes: string): Promise<void> => {
        await api.put(`/api/admin/withdrawals/${id}/reject`, { adminNotes });
    }
};

export default payoutApi;
