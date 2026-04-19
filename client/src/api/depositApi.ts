import axiosInstance from "./axiosInstance";

// ─── Types ────────────────────────────────────────────────────

export interface DepositInstructions {
  currency: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  swift_code?: string;
  iban?: string;
  instructions?: string;
}

export interface GreyPaymentDetails {
  reference: string;
  amount: number;
  currency: string;
  expiresAt: string;
  instructions: {
    bank_name: string;
    account_name: string;
    account_number: string;
    swift_code?: string;
    iban?: string;
    additional_info?: string;
    reference: string;
    amount: number;
    currency: string;
    expires_at: string;
    expiry_minutes: number;
  };
}

export interface PaystackPaymentResult {
  url: string;
  checkoutUrl: string;
  reference: string;
  provider: string;
}

export interface PaymentStatus {
  success: boolean;
  status: string;
  amount?: number;
  currency?: string;
  credited?: boolean;
  senderName?: string;
  expiresAt?: string;
  provider?: string;
  
  // Layer 3 & 4 Settlement Signals
  settlementStatus?: "PENDING_SETTLEMENT" | "SETTLEMENT_CONFIRMED" | "FINALIZED_LEDGER";
  settlingBalance?: number;
  finalizedBalance?: number;
  isProvisional?: boolean;
}

export interface ManualDeposit {
  id: string;
  user_id: string;
  amount: number;
  currency: string;
  reference: string;
  proof_url?: string;
  status: "pending" | "approved" | "rejected";
  admin_notes?: string;
  created_at: string;
  updated_at: string;
  profile?: {
    email: string;
    full_name: string;
    username: string;
  };
}

// ─── API ──────────────────────────────────────────────────────

const depositApi = {
  // ─── Paystack Flow ──────────────────────────────────────────

  /**
   * Initialize a Paystack payment.
   * Returns a checkout URL to redirect the user to.
   */
  initiatePaystack: async (
    amount: number,
    currency: string,
    metadata?: Record<string, unknown>
  ): Promise<PaystackPaymentResult> => {
    const response = await axiosInstance.post("/payment/initialize", {
      amount,
      currency,
      provider: "paystack",
      metadata: { ...metadata, type: "DEPOSIT" },
    });
    return response.data;
  },

  /**
   * Verify a Paystack payment after checkout redirect.
   */
  verifyPaystack: async (reference: string): Promise<PaymentStatus> => {
    const response = await axiosInstance.post("/payment/verify-paystack", {
      reference,
    });
    return response.data;
  },

  // ─── Grey Flow ──────────────────────────────────────────────

  /**
   * Initialize a Grey bank transfer payment.
   * Returns bank details and unique reference for the user.
   */
  initiateGrey: async (
    amount: number,
    currency: string,
    metadata?: Record<string, unknown>
  ): Promise<GreyPaymentDetails> => {
    const response = await axiosInstance.post("/payment/initialize", {
      amount,
      currency,
      provider: "grey",
      metadata: { ...metadata, type: "DEPOSIT", method: "bank_transfer" },
    });

    // The response includes instructions from GreyProvider
    return {
      reference: response.data.reference,
      amount,
      currency,
      expiresAt:
        response.data.instructions?.expires_at ||
        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      instructions: response.data.instructions || response.data,
    };
  },

  /**
   * Poll Grey payment status.
   * Returns current status (pending/success/expired).
   */
  verifyGrey: async (reference: string): Promise<PaymentStatus> => {
    const response = await axiosInstance.post("/payment/verify-grey", {
      reference,
    });
    return response.data;
  },

  // ─── Generic ────────────────────────────────────────────────

  /**
   * Check payment status by reference (works for any provider).
   */
  checkStatus: async (reference: string): Promise<PaymentStatus> => {
    const response = await axiosInstance.get(
      `/payment/status/${reference}`
    );
    return response.data;
  },

  /**
   * Poll payment status at regular intervals until resolved.
   * Calls the callback with each status update.
   * Returns a cleanup function to stop polling.
   */
  pollPaymentStatus: (
    reference: string,
    provider: "paystack" | "grey",
    onUpdate: (status: PaymentStatus) => void,
    intervalMs = 5000
  ): (() => void) => {
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;

    const check = async () => {
      if (stopped) return;

      try {
        const status =
          provider === "grey"
            ? await depositApi.verifyGrey(reference)
            : await depositApi.verifyPaystack(reference);

        onUpdate(status);

        // Stop polling on terminal states
        if (
          status.success ||
          status.status === "COMPLETED" ||
          status.status === "success" ||
          status.status === "FAILED" ||
          status.status === "failed" ||
          status.status === "expired"
        ) {
          if (timer) clearInterval(timer);
          stopped = true;
        }
      } catch {
        // Continue polling on error
      }
    };

    // Start polling
    check();
    timer = setInterval(check, intervalMs);

    // Return cleanup function
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
    };
  },

  // ─── Manual Deposit (Legacy) ────────────────────────────────

  /**
   * Initiate a deposit to get Grey details and a unique reference.
   * @deprecated Use initiateGrey() instead
   */
  initiate: async (
    currency: string
  ): Promise<{ instructions: DepositInstructions; reference: string }> => {
    const response = await axiosInstance.get(
      `/deposit/initiate?currency=${currency}`
    );
    return response.data;
  },

  /**
   * Submit deposit proof and reference.
   */
  submit: async (data: {
    amount: number;
    currency: string;
    reference: string;
    proofUrl?: string;
  }): Promise<{ message: string; deposit: ManualDeposit }> => {
    const response = await axiosInstance.post("/deposit/submit", data);
    return response.data;
  },

  /**
   * Fetch logged-in user's deposit history.
   */
  getUserHistory: async (): Promise<ManualDeposit[]> => {
    const response = await axiosInstance.get("/deposit/user");
    return response.data;
  },

  // ─── Admin ──────────────────────────────────────────────────

  /**
   * Admin: Fetch all pending deposits.
   */
  getAdminPending: async (): Promise<ManualDeposit[]> => {
    const response = await axiosInstance.get("/deposit/admin/pending");
    return response.data;
  },

  /**
   * Admin: Approve a deposit.
   */
  approve: async (
    id: string,
    adminNotes?: string
  ): Promise<{ message: string }> => {
    const response = await axiosInstance.patch(`/deposit/${id}/approve`, {
      adminNotes,
    });
    return response.data;
  },

  /**
   * Admin: Reject a deposit.
   */
  reject: async (
    id: string,
    adminNotes?: string
  ): Promise<{ message: string }> => {
    const response = await axiosInstance.patch(`/deposit/${id}/reject`, {
      adminNotes,
    });
    return response.data;
  },

  /**
   * Get payment instructions for a currency.
   */
  getInstructions: async (
    currency: string
  ): Promise<DepositInstructions> => {
    const response = await axiosInstance.get(
      `/payment/instructions/${currency}`
    );
    return response.data;
  },
};

export default depositApi;
