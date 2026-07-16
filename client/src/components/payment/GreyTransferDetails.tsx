import { useState, useEffect, useCallback, useRef } from "react";
import depositApi from "../../api/depositApi";
import type { PaymentStatus } from "../../api/depositApi";
import "./GreyTransferDetails.css";

interface GreyTransferDetailsProps {
  reference: string;
  amount: number;
  currency: string;
  expiresAt: string;
  instructions: Record<string, unknown>;
  onConfirmed: (status: PaymentStatus) => void;
  onBack: () => void;
}

/**
 * GreyTransferDetails Component
 *
 * Shows bank account details for manual bank transfer payments.
 * Features:
 * - Copy-to-clipboard for all fields
 * - Live countdown timer for payment window
 * - Auto-polling for payment confirmation (via Brevo email parsing)
 * - Step-by-step instructions
 * - "I've made the transfer" confirmation
 */
export default function GreyTransferDetails({
  reference,
  amount,
  currency,
  expiresAt,
  instructions,
  onConfirmed,
  onBack,
}: GreyTransferDetailsProps) {
  const [timeLeft, setTimeLeft] = useState("");
  const [isExpired, setIsExpired] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [pollStatus, setPollStatus] = useState<string>("waiting");
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isSafeMode, setIsSafeMode] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const stopPollingRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Check system status
    const checkSystemMode = async () => {
       const { data } = await supabase.from('admin_settings').select('value').eq('key', 'SYSTEM_MODE').single();
       if (data?.value?.mode === 'SAFE') setIsSafeMode(true);
    };

    const checkUserRole = async () => {
       const { data: { user } } = await supabase.auth.getUser();
       const { data: profile } = await supabase.from('profiles').select('role').eq('id', user?.id).maybeSingle();
       if (profile?.role === 'admin' || profile?.role === 'superadmin') setIsAdmin(true);
    }

    checkSystemMode();
    checkUserRole();
    
    if (pollStatus === "confirmed" || pollStatus === "failed") return;
  }, [pollStatus]);

  const bankName = (instructions.bank_name as string) || "";
  const accountName = (instructions.account_name as string) || "";
  const accountNumber = (instructions.account_number as string) || "";
  const swiftCode = (instructions.swift_code as string) || "";
  const iban = (instructions.iban as string) || "";
  const additionalInfo = (instructions.additional_info as string) || "";
  const displayRef = (instructions.reference as string) || reference;
  const criticalWarning = (instructions.critical_warning as string) || "";

  // ─── Countdown Timer ──────────────────────────────────────

  useEffect(() => {
    const updateTimer = () => {
      const now = Date.now();
      const expiry = new Date(expiresAt).getTime();
      const diff = expiry - now;

      if (diff <= 0) {
        setTimeLeft("Expired");
        setIsExpired(true);
        return;
      }

      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${mins}m ${secs.toString().padStart(2, "0")}s`);
    };

    updateTimer();
    const timer = setInterval(updateTimer, 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);

  // ─── Cleanup Polling on Unmount ───────────────────────────

  useEffect(() => {
    return () => {
      if (stopPollingRef.current) {
        stopPollingRef.current();
      }
    };
  }, []);

  // ─── Copy to Clipboard ────────────────────────────────────

  const copyToClipboard = useCallback(
    async (text: string, field: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      } catch {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
        setCopiedField(field);
        setTimeout(() => setCopiedField(null), 2000);
      }
    },
    []
  );

  // ─── Start Polling ────────────────────────────────────────

  const handleTransferMade = useCallback(() => {
    setIsPolling(true);
    setPollStatus("checking");

    const stopFn = depositApi.pollPaymentStatus(
      reference,
      "grey",
      (status: PaymentStatus) => {
        if (status.success || status.status === "success") {
          // If explicitly finalized or no provisional status, we're done
          if (!status.isProvisional && status.settlementStatus === "FINALIZED_LEDGER") {
              setPollStatus("confirmed");
              setIsPolling(false);
              onConfirmed(status);
          } else if (status.isProvisional) {
              setPollStatus("settling");
          } else {
              setPollStatus("confirmed");
              setIsPolling(false);
              onConfirmed(status);
          }
        } else if (status.status === "needs_review" || status.status === "pending_review") {
          setPollStatus("review");
          setIsPolling(false);
        } else if (
          status.status === "expired" ||
          status.status === "failed"
        ) {
          setPollStatus("failed");
          setIsPolling(false);
        } else {
          setPollStatus("checking");
        }
      },
      8000 // Poll every 8 seconds
    );

    stopPollingRef.current = stopFn;
  }, [reference, onConfirmed]);

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="gt-container">
      {/* Header */}
      <div className="gt-header">
        <button className="gt-back-btn" onClick={onBack} aria-label="Go back">
          ← Back
        </button>
        <h2 className="gt-title">Bank Transfer Details</h2>
        <div className={`gt-timer ${isExpired ? "gt-timer-expired" : ""}`}>
          {isExpired ? "⏰ Expired" : `⏱ ${timeLeft}`}
        </div>
      </div>

      {/* Amount Banner */}
      <div className="gt-amount-banner">
        <span className="gt-amount-label">Transfer Exactly</span>
        <span className="gt-amount-value">
          {currency} {amount.toLocaleString()}
        </span>
        <button
          className="gt-copy-amount"
          onClick={() => copyToClipboard(String(amount), "amount")}
        >
          {copiedField === "amount" ? "✓" : "📋"}
        </button>
      </div>

      {/* Bank Details */}
      <div className="gt-details-card">
        <DetailRow
          label="Bank Name"
          value={bankName}
          fieldKey="bank"
          copiedField={copiedField}
          onCopy={copyToClipboard}
        />
        <DetailRow
          label="Account Name"
          value={accountName}
          fieldKey="name"
          copiedField={copiedField}
          onCopy={copyToClipboard}
        />
        <DetailRow
          label="Account Number"
          value={accountNumber}
          fieldKey="number"
          copiedField={copiedField}
          onCopy={copyToClipboard}
          highlight
        />
        {swiftCode && (
          <DetailRow
            label="SWIFT Code"
            value={swiftCode}
            fieldKey="swift"
            copiedField={copiedField}
            onCopy={copyToClipboard}
          />
        )}
        {iban && (
          <DetailRow
            label="IBAN"
            value={iban}
            fieldKey="iban"
            copiedField={copiedField}
            onCopy={copyToClipboard}
          />
        )}
      </div>

      {/* Reference */}
      <div className="gt-reference-card">
        <span className="gt-ref-label">
          Payment Reference{" "}
          <span className="gt-ref-required">(Required in narration)</span>
        </span>
        <div className="gt-ref-value-row">
          <span className="gt-ref-value">{displayRef}</span>
          <button
            className="gt-copy-btn gt-copy-ref"
            onClick={() => copyToClipboard(displayRef, "ref")}
          >
            {copiedField === "ref" ? "Copied! ✓" : "Copy Reference"}
          </button>
        </div>
        {criticalWarning && (
          <div className="gt-critical-alert" style={{marginTop: '12px', padding: '10px', backgroundColor: 'rgba(255, 170, 0, 0.1)', borderLeft: '4px solid #ffaa00', color: '#cc8800', fontSize: '13px', borderRadius: '4px'}}>
            <strong>⚠️ CRITICAL:</strong> {criticalWarning}
          </div>
        )}
      </div>

      {/* Instructions */}
      <div className="gt-instructions">
        <h4>📋 How to complete your transfer:</h4>
        <ol>
          <li>
            Open your banking app and initiate a transfer to the account above
          </li>
          <li>
            Enter the <strong>exact amount</strong>: {currency}{" "}
            {amount.toLocaleString()}
          </li>
          <li>
            Include <strong>{displayRef}</strong> in the transfer
            narration/memo/description
          </li>
          <li>Complete the transfer and click "I&apos;ve made the transfer" below</li>
        </ol>
        {additionalInfo && <p className="gt-extra-info">ℹ️ {additionalInfo}</p>}
      </div>

      {/* Action Buttons */}
      {!isExpired && (
        <div className="gt-actions">
          {!isPolling ? (
            <button
              className="gt-confirm-btn"
              onClick={handleTransferMade}
              id="confirm-transfer-made"
            >
              ✅ I&apos;ve Made the Transfer
            </button>
          ) : (
            <div className="gt-polling-status">
              {pollStatus === "checking" && (
                <>
                  <div className="gt-poll-spinner" />
                  <p>
                    Waiting for payment confirmation...
                    <br />
                    <small>
                      This may take a few minutes. We&apos;ll detect it
                      automatically.
                    </small>
                  </p>
                </>
              )}
              {isSafeMode && (
                <div className="gt-safe-mode-alert">
                  <span className="gt-alert-icon">⚠️</span>
                  <div className="gt-alert-content">
                    <h4>System Protected (Safe Mode)</h4>
                    <p>Automated settlement is temporarily paused for security. Your funds are recorded and will be processed once audits conclude.</p>
                    {isAdmin && (
                        <button className="gt-admin-override-btn" onClick={() => {/* logic for multi-admin request */}}>
                           Initiate Multi-Admin Override →
                        </button>
                    )}
                  </div>
                </div>
              )}

              {pollStatus === "checking" && (
                <div className="gt-poll-checking">
                  <div className="gt-loader" />
                  <p>Searching for your bank transfer...</p>
                </div>
              )}
              {pollStatus === "confirmed" && (
                <div className="gt-poll-success">
                  <span>✅</span>
                  <p>Payment Finalized! Crediting complete.</p>
                </div>
              )}
              {pollStatus === "settling" && (
                <div className="gt-poll-settling">
                   <div className="gt-settling-loader" />
                   <span>⏳ Settling...</span>
                   <p>Your payment was detected and matched! Funds are now <strong>provisionally available</strong> for use while bank-grade finalization concludes (Layer 3 Settlement).</p>
                   <button className="gt-continue-btn" onClick={() => onConfirmed({ success: true, status: 'success' })}>
                      Continue with Provisional Balance →
                   </button>
                </div>
              )}
              {pollStatus === "review" && (
                <div className="gt-poll-review" style={{color: '#d97706'}}>
                  <span>⏳</span>
                  <p>Your payment was detected but needs manual review (e.g. amount variance or missing reference). Our team will process this shortly.</p>
                </div>
              )}
              {pollStatus === "failed" && (
                <div className="gt-poll-failed">
                  <span>⚠️</span>
                  <p>
                    We haven&apos;t detected your payment yet. If you&apos;ve
                    already transferred, please wait or contact support.
                  </p>
                  <button
                    className="gt-retry-poll-btn"
                    onClick={handleTransferMade}
                  >
                    Check Again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {isExpired && (
        <div className="gt-expired-notice">
          <p>This payment window has expired. Please initiate a new deposit.</p>
          <button className="gt-new-deposit-btn" onClick={onBack}>
            New Deposit
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Detail Row Sub-component ───────────────────────────────

function DetailRow({
  label,
  value,
  fieldKey,
  copiedField,
  onCopy,
  highlight,
}: {
  label: string;
  value: string;
  fieldKey: string;
  copiedField: string | null;
  onCopy: (text: string, field: string) => void;
  highlight?: boolean;
}) {
  return (
    <div className={`gt-detail-row ${highlight ? "gt-highlight" : ""}`}>
      <span className="gt-detail-label">{label}</span>
      <div className="gt-detail-value-wrap">
        <span className={`gt-detail-value ${highlight ? "gt-mono" : ""}`}>
          {value}
        </span>
        <button
          className="gt-copy-btn"
          onClick={() => onCopy(value, fieldKey)}
          aria-label={`Copy ${label}`}
        >
          {copiedField === fieldKey ? "✓" : "📋"}
        </button>
      </div>
    </div>
  );
}
