import { API_URL } from '../lib/api';

export interface PayoutBatchItem {
  id: string;
  batch_id: string;
  recipient_user_id: string;
  recipient_wallet_id: string;
  amount: number;
  currency: string;
  item_index: number;
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
  error_message?: string;
  created_at?: string;
}

export interface PayoutBatch {
  id: string;
  batch_reference: string;
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  source_wallet_id: string;
  currency: string;
  total_amount: number;
  recipient_count: number;
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
  failure_reason?: string;
  idempotency_key: string;
  ledger_transaction_id?: string;
  created_at: string;
  updated_at: string;
  items?: PayoutBatchItem[];
}

export interface CreateBatchInput {
  source_wallet_id: string;
  currency: string;
  idempotency_key?: string;
  entries: {
    recipient_identifier: string;
    amount: number;
    item_index: number;
  }[];
}

export interface GetBatchesQuery {
  page?: number;
  limit?: number;
  status?: string;
  currency?: string;
}

const getAuthHeaders = (token: string) => ({
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`,
});

export const bulkTransferService = {
  async getBatches(token: string, query: GetBatchesQuery = {}): Promise<{ batches: PayoutBatch[]; total: number; page: number; limit: number }> {
    const params = new URLSearchParams();
    if (query.page) params.append('page', String(query.page));
    if (query.limit) params.append('limit', String(query.limit));
    if (query.status) params.append('status', query.status);
    if (query.currency) params.append('currency', query.currency);

    const res = await fetch(`${API_URL}/api/v1/admin/bulk-transfers?${params.toString()}`, {
      headers: getAuthHeaders(token),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Failed to fetch batches (${res.status})`);
    }
    return res.json();
  },

  async getBatchDetail(token: string, id: string): Promise<{ batch: PayoutBatch; items: PayoutBatchItem[] }> {
    const res = await fetch(`${API_URL}/api/v1/admin/bulk-transfers/${id}`, {
      headers: getAuthHeaders(token),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Failed to fetch batch details (${res.status})`);
    }
    return res.json();
  },

  async createBatch(token: string, payload: CreateBatchInput): Promise<{ success: boolean; batch: PayoutBatch; items: PayoutBatchItem[]; is_retry?: boolean }> {
    const res = await fetch(`${API_URL}/api/v1/admin/bulk-transfers`, {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Failed to create payout batch (${res.status})`);
    }
    return res.json();
  },

  async approveBatch(token: string, id: string): Promise<{ success: boolean; batch: PayoutBatch }> {
    const res = await fetch(`${API_URL}/api/v1/admin/bulk-transfers/${id}/approve`, {
      method: 'POST',
      headers: getAuthHeaders(token),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Failed to approve batch (${res.status})`);
    }
    return res.json();
  },

  async executeBatch(token: string, id: string): Promise<{ success: boolean; status: string; transactionId?: string; message?: string }> {
    // Note: Request body is empty — execution financial parameters come EXCLUSIVELY from persisted DB state.
    const res = await fetch(`${API_URL}/api/v1/admin/bulk-transfers/${id}/execute`, {
      method: 'POST',
      headers: getAuthHeaders(token),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Failed to execute batch (${res.status})`);
    }
    return res.json();
  },

  async reconcileBatch(token: string, id: string): Promise<{ success: boolean; status: string; transactionId?: string; message?: string; reconciled?: boolean }> {
    const res = await fetch(`${API_URL}/api/v1/admin/bulk-transfers/${id}/reconcile`, {
      method: 'POST',
      headers: getAuthHeaders(token),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Failed to reconcile batch (${res.status})`);
    }
    return res.json();
  },

  async cancelBatch(token: string, id: string): Promise<{ success: boolean; batch: PayoutBatch }> {
    const res = await fetch(`${API_URL}/api/v1/admin/bulk-transfers/${id}/cancel`, {
      method: 'POST',
      headers: getAuthHeaders(token),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || err.message || `Failed to cancel batch (${res.status})`);
    }
    return res.json();
  },
};
