import api from "../api/axiosInstance";

export type AnchorBank = {
  name: string;
  code: string;
  slug: string;
};

export type AnchorAccount = {
  id: string;
  bank_name?: string;
  bankName?: string;
  account_number?: string;
  accountNumber?: string;
  account_name?: string;
  accountName?: string;
  currency: string;
  provider: string;
  created_at?: string;
};

export type AnchorHealth = {
  enabled: boolean;
  status: string;
  mode: string;
  latencyMs: number;
  authenticated?: boolean;
};

export const anchorApi = {
  async getHealth(): Promise<AnchorHealth> {
    try {
      const res = await api.get("/anchor/health");
      return res.data.health;
    } catch {
      return { enabled: false, status: "disabled", mode: "sandbox", latencyMs: 0 };
    }
  },

  async getBanks(): Promise<AnchorBank[]> {
    try {
      const res = await api.get("/anchor/banks");
      return res.data.banks || [];
    } catch (err: any) {
      console.warn("[AnchorAPI] Failed to fetch bank list:", err.message);
      return [];
    }
  },

  async verifyAccount(accountNumber: string, bankCode: string): Promise<{ accountName: string; accountNumber: string; bankCode: string }> {
    const res = await api.post("/anchor/verify-account", { accountNumber, bankCode });
    return res.data.data;
  },

  async createVirtualAccount(params: { firstName?: string; lastName?: string; phone?: string; bvn?: string }): Promise<AnchorAccount> {
    const res = await api.post("/anchor/virtual-account", params);
    return res.data.data;
  },

  async getAccounts(): Promise<AnchorAccount[]> {
    try {
      const res = await api.get("/anchor/accounts");
      return res.data.accounts || [];
    } catch {
      return [];
    }
  },

  async initiateTransfer(params: { amount: number; currency?: string; accountNumber: string; bankCode: string; accountName?: string; reason?: string }) {
    const res = await api.post("/anchor/transfer", params);
    return res.data.data;
  },
};
