/**
 * Fincra Virtual Account Card — Standalone Frontend Component
 * ────────────────────────────────────────────────────────────
 * NEW FILE. The existing BankAccountCard.tsx is NOT modified.
 *
 * Renders a user's Fincra virtual bank account for deposits.
 *
 * INVARIANTS:
 *   - Never displays Fincra balance as the user's NoteStandard wallet balance.
 *   - Shows account number and bank name for deposits only.
 *   - Clearly labelled as "Fincra Deposit Account" — separate from primary wallet.
 *   - Only renders when ENABLE_FINCRA is true (checked at route level; this
 *     component simply renders the data it receives from the API).
 */

import React, { useState, useEffect } from "react";

interface FincraAccount {
  id: string;
  account_number: string;
  account_name:   string;
  bank_name:      string;
  currency:       string;
  status:         string;
}

interface FincraVirtualAccountCardProps {
  userId?: string;
}

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

export const FincraVirtualAccountCard: React.FC<FincraVirtualAccountCardProps> = () => {
  const [accounts, setAccounts]   = useState<FincraAccount[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [copied, setCopied]       = useState<string | null>(null);

  useEffect(() => {
    fetchFincraAccounts();
  }, []);

  async function fetchFincraAccounts() {
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem("token") || sessionStorage.getItem("token");
      const res   = await fetch(`${API_BASE}/api/fincra/accounts`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const body = await res.json();
        if (body.code === "FINCRA_DISABLED") {
          // Fincra not enabled — silently render nothing
          setAccounts([]);
          return;
        }
        throw new Error(body.error || "Failed to load Fincra accounts.");
      }

      const body = await res.json();
      setAccounts(body.accounts || []);
    } catch (err: any) {
      setError(err.message || "Could not load Fincra virtual accounts.");
    } finally {
      setLoading(false);
    }
  }

  async function copyToClipboard(text: string, label: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Ignore copy errors silently
    }
  }

  if (loading) {
    return (
      <div className="fincra-card fincra-card--loading" aria-label="Loading Fincra accounts">
        <div className="fincra-skeleton" />
      </div>
    );
  }

  // If Fincra is disabled or user has no accounts yet, render nothing.
  if (!accounts.length) return null;

  return (
    <div className="fincra-accounts-container" role="region" aria-label="Fincra Deposit Accounts">
      {accounts.map((account) => (
        <div key={account.id} className="fincra-card" data-currency={account.currency}>
          {/* ── Header ── */}
          <div className="fincra-card__header">
            <div className="fincra-card__badge">Deposit Account</div>
            <span className="fincra-card__currency">{account.currency}</span>
          </div>

          {/* ── Bank Name ── */}
          <p className="fincra-card__bank-name">{account.bank_name || "—"}</p>

          {/* ── Account Name ── */}
          <p className="fincra-card__account-name">{account.account_name}</p>

          {/* ── Account Number ── */}
          <div className="fincra-card__account-number-row">
            <span className="fincra-card__account-number">{account.account_number}</span>
            <button
              className="fincra-card__copy-btn"
              aria-label={`Copy account number ${account.account_number}`}
              onClick={() => copyToClipboard(account.account_number, account.id)}
            >
              {copied === account.id ? "✓ Copied" : "Copy"}
            </button>
          </div>

          {/* ── Disclaimer ── */}
          <p className="fincra-card__disclaimer">
            Transfer to this account to fund your wallet.
            Balance reflects in your NoteStandard wallet after confirmation.
          </p>
        </div>
      ))}

      {/* ── Error notice ── */}
      {error && (
        <p className="fincra-card__error" role="alert">{error}</p>
      )}
    </div>
  );
};

export default FincraVirtualAccountCard;
