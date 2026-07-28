import React, { useState, useEffect } from "react";
import { WithdrawalOtpModal } from "./WithdrawalOtpModal";

interface BankAccountResult {
  accountName: string;
  accountNumber: string;
  bankCode: string;
}

interface FincraWithdrawalFormProps {
  API_BASE?: string;
  getAuthHeaders?: () => Record<string, string>;
}

export const FincraWithdrawalForm: React.FC<FincraWithdrawalFormProps> = ({
  API_BASE = "",
  getAuthHeaders = () => ({ "Content-Type": "application/json" }),
}) => {
  const [bankCode, setBankCode]           = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [amount, setAmount]               = useState("");
  const [narration, setNarration]         = useState("");
  const [currency, setCurrency]           = useState("NGN");

  const [verifyingAccount, setVerifyingAccount] = useState(false);
  const [accountRes, setAccountRes]             = useState<BankAccountResult | null>(null);
  const [accountErr, setAccountErr]             = useState<string | null>(null);

  const [submitting, setSubmitting]             = useState(false);
  const [result, setResult]                     = useState<{ reference?: string; error?: string } | null>(null);

  const [otpChallenge, setOtpChallenge]         = useState<{
    withdrawalReference: string;
    fincraReference?: string;
    traceId?: string;
    amount: number;
    currency: string;
    accountName: string;
    accountNumberMasked: string;
    bankName: string;
  } | null>(null);

  // Auto-verify account number when 10 digits & bankCode selected
  useEffect(() => {
    if (accountNumber.length === 10 && bankCode) {
      handleVerifyAccount();
    } else {
      setAccountRes(null);
      setAccountErr(null);
    }
  }, [accountNumber, bankCode]);

  async function handleVerifyAccount() {
    setVerifyingAccount(true);
    setAccountErr(null);
    setAccountRes(null);

    try {
      const res = await fetch(`${API_BASE}/api/fincra/verify-account`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ accountNumber, bankCode, currency }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Account resolution failed.");
      setAccountRes({
        accountName:   body.accountName,
        accountNumber: body.accountNumber,
        bankCode:       body.bankCode,
      });
    } catch (err: any) {
      setAccountErr(err.message);
    } finally {
      setVerifyingAccount(false);
    }
  }

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!accountRes || !amount || submitting) return;

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

      if (body.otpRequired || body.status === "OTP_REQUIRED") {
        setOtpChallenge({
          withdrawalReference: body.withdrawal_reference || body.reference || "FIN_PAYOUT_REF",
          fincraReference:     body.fincra_reference,
          traceId:             body.trace_id,
          amount:              parsedAmount,
          currency,
          accountName:         accountRes.accountName,
          accountNumberMasked: `${accountRes.accountNumber.substring(0, 2)}****${accountRes.accountNumber.substring(accountRes.accountNumber.length - 2)}`,
          bankName:            bankCode,
        });
        return;
      }

      setResult({ reference: body.withdrawal_reference || body.reference });
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

      {result?.error && (
        <div className="fincra-alert fincra-alert--error" role="alert">
          {result.error}
        </div>
      )}

      <form onSubmit={handleWithdraw}>
        <div className="fincra-field">
          <label htmlFor="fincra-currency">Currency</label>
          <select
            id="fincra-currency"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            <option value="NGN">NGN - Nigerian Naira</option>
            <option value="USD">USD - US Dollar</option>
            <option value="EUR">EUR - Euro</option>
          </select>
        </div>

        <div className="fincra-field">
          <label htmlFor="fincra-bank">Bank Code</label>
          <input
            id="fincra-bank"
            type="text"
            placeholder="e.g. 058 (GTBank), 011 (First Bank)"
            value={bankCode}
            onChange={(e) => setBankCode(e.target.value)}
            required
          />
        </div>

        <div className="fincra-field">
          <label htmlFor="fincra-account">Account Number</label>
          <input
            id="fincra-account"
            type="text"
            maxLength={10}
            placeholder="10-digit account number"
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            required
          />
        </div>

        {verifyingAccount && (
          <p className="fincra-status fincra-status--info">Resolving account details...</p>
        )}

        {accountErr && (
          <p className="fincra-status fincra-status--error">{accountErr}</p>
        )}

        {accountRes && (
          <div className="fincra-account-card">
            <span className="fincra-account-card__label">Beneficiary Name</span>
            <strong className="fincra-account-card__name">{accountRes.accountName}</strong>
          </div>
        )}

        <div className="fincra-field">
          <label htmlFor="fincra-amount">Amount ({currency})</label>
          <input
            id="fincra-amount"
            type="number"
            step="0.01"
            min="100"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        <div className="fincra-field">
          <label htmlFor="fincra-narration">Description (Optional)</label>
          <input
            id="fincra-narration"
            type="text"
            placeholder="Reason for withdrawal"
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="fincra-btn"
          disabled={!accountRes || !amount || submitting}
        >
          {submitting ? "Processing Withdrawal..." : "Confirm & Withdraw"}
        </button>
      </form>

      {/* OTP Modal */}
      {otpChallenge && (
        <WithdrawalOtpModal
          isOpen={!!otpChallenge}
          onClose={() => setOtpChallenge(null)}
          withdrawalReference={otpChallenge.withdrawalReference}
          fincraReference={otpChallenge.fincraReference}
          traceId={otpChallenge.traceId}
          amount={otpChallenge.amount}
          currency={otpChallenge.currency}
          accountName={otpChallenge.accountName}
          accountNumberMasked={otpChallenge.accountNumberMasked}
          bankName={otpChallenge.bankName}
          onSuccess={(res) => {
            setOtpChallenge(null);
            setResult({ reference: res.withdrawal_reference || otpChallenge.withdrawalReference });
          }}
        />
      )}
    </div>
  );
};

export default FincraWithdrawalForm;
