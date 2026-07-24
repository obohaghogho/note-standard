/**
 * Fincra Withdrawal Form — Standalone Frontend Component
 * ───────────────────────────────────────────────────────
 * NEW FILE. No existing wallet UI components are modified.
 *
 * Allows users to initiate NGN/USD/EUR bank withdrawals via Fincra.
 *
 * Flow:
 *  1. User enters bank code, account number → verify-account API
 *  2. Account name resolved and displayed for confirmation
 *  3. User enters amount → withdraw API
 *  4. Shows status (PENDING → success/failure via webhook)
 */

import React, { useState } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:5000";

interface AccountResolution {
  accountName:   string;
  accountNumber: string;
  bank:          { code: string; name?: string };
}

const SUPPORTED_CURRENCIES = ["NGN", "USD", "EUR"];

export const FincraWithdrawalForm: React.FC = () => {
  const [currency,       setCurrency]       = useState("NGN");
  const [bankCode,       setBankCode]       = useState("");
  const [accountNumber,  setAccountNumber]  = useState("");
  const [accountRes,     setAccountRes]     = useState<AccountResolution | null>(null);
  const [resolving,      setResolving]      = useState(false);
  const [amount,         setAmount]         = useState("");
  const [narration,      setNarration]      = useState("");
  const [submitting,     setSubmitting]     = useState(false);
  const [result,         setResult]         = useState<{ reference?: string; error?: string } | null>(null);

  const getAuthHeaders = () => {
    const token = localStorage.getItem("token") || sessionStorage.getItem("token");
    return {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
    };
  };

  async function handleVerifyAccount() {
    if (!bankCode || !accountNumber) return;
    setResolving(true);
    setAccountRes(null);

    try {
      const res  = await fetch(`${API_BASE}/api/fincra/verify-account`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ bankCode, accountNumber, currency }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Account verification failed.");
      setAccountRes(body);
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setResolving(false);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!accountRes || !amount) return;

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setResult({ error: "Enter a valid withdrawal amount." });
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      const res  = await fetch(`${API_BASE}/api/fincra/withdraw`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          amount:        parsedAmount,
          currency,
          bankCode,
          accountNumber: accountRes.accountNumber,
          accountName:   accountRes.accountName,
          narration:     narration || "NoteStandard withdrawal",
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Withdrawal request failed.");
      setResult({ reference: body.reference });
    } catch (err: any) {
      setResult({ error: err.message });
    } finally {
      setSubmitting(false);
    }
  }

  if (result?.reference) {
    return (
      <div className="fincra-form fincra-form--success" role="alert">
        <h3>Withdrawal Request Submitted</h3>
        <p>Your withdrawal is being processed.</p>
        <p className="fincra-form__ref">Reference: <code>{result.reference}</code></p>
        <button className="fincra-btn" onClick={() => { setResult(null); setAccountRes(null); setAmount(""); }}>
          New Withdrawal
        </button>
      </div>
    );
  }

  return (
    <div className="fincra-form" role="region" aria-label="Fincra Bank Withdrawal">
      <h3 className="fincra-form__title">Withdraw to Bank Account</h3>
      <p className="fincra-form__subtitle">
        Withdrawals are charged from your NoteStandard wallet balance.
      </p>

      {/* ── Currency ── */}
      <div className="fincra-form__field">
        <label htmlFor="fincra-currency">Currency</label>
        <select
          id="fincra-currency"
          value={currency}
          onChange={(e) => { setCurrency(e.target.value); setAccountRes(null); }}
          className="fincra-form__input"
        >
          {SUPPORTED_CURRENCIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* ── Bank Code ── */}
      <div className="fincra-form__field">
        <label htmlFor="fincra-bank-code">Bank Code</label>
        <input
          id="fincra-bank-code"
          name="bankCode"
          type="text"
          placeholder="e.g. 058 (GTB)"
          value={bankCode}
          onChange={(e) => { setBankCode(e.target.value); setAccountRes(null); }}
          className="fincra-form__input"
        />
      </div>

      {/* ── Account Number ── */}
      <div className="fincra-form__field">
        <label htmlFor="fincra-account-number">Account Number</label>
        <input
          id="fincra-account-number"
          name="accountNumber"
          type="text"
          maxLength={10}
          placeholder="10-digit NUBAN"
          value={accountNumber}
          onChange={(e) => { setAccountNumber(e.target.value); setAccountRes(null); }}
          className="fincra-form__input"
        />
        <button
          type="button"
          className="fincra-btn fincra-btn--secondary"
          onClick={handleVerifyAccount}
          disabled={resolving || !bankCode || !accountNumber}
          aria-label="Verify bank account"
        >
          {resolving ? "Verifying…" : "Verify Account"}
        </button>
      </div>

      {/* ── Resolved Account Name ── */}
      {accountRes && (
        <div className="fincra-form__resolved" role="status" aria-live="polite">
          <strong>Account Name:</strong> {accountRes.accountName}
        </div>
      )}

      {/* ── Amount ── */}
      {accountRes && (
        <form onSubmit={handleWithdraw}>
          <div className="fincra-form__field">
            <label htmlFor="fincra-amount">Amount ({currency})</label>
            <input
              id="fincra-amount"
              name="amount"
              type="number"
              min="1"
              step="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="fincra-form__input"
              required
            />
          </div>

          <div className="fincra-form__field">
            <label htmlFor="fincra-narration">Narration (optional)</label>
            <input
              id="fincra-narration"
              name="narration"
              type="text"
              maxLength={64}
              placeholder="Payment description"
              value={narration}
              onChange={(e) => setNarration(e.target.value)}
              className="fincra-form__input"
            />
          </div>

          <button
            type="submit"
            className="fincra-btn fincra-btn--primary"
            disabled={submitting || !amount}
          >
            {submitting ? "Processing…" : `Withdraw ${currency}`}
          </button>
        </form>
      )}

      {/* ── Error ── */}
      {result?.error && (
        <p className="fincra-form__error" role="alert">{result.error}</p>
      )}
    </div>
  );
};

export default FincraWithdrawalForm;
