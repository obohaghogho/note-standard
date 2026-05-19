import { useState, useCallback, useEffect } from "react";
import depositApi from "../../api/depositApi";
import type { PaymentStatus } from "../../api/depositApi";
import GreyTransferDetails from "./GreyTransferDetails";
import { paymentCapabilities } from "../../config/paymentCapabilities";
import "./PaymentSelector.css";

// ── Gateway Routing Info ───────────────────────────────────────────────
// Per-currency notices shown to users before checkout.
// These set expectations for payment processing without alarming users.
const GATEWAY_ROUTING_INFO: Record<string, { icon: string; message: string }> = {
  USD: {
    icon: "💡",
    message:
      "Note: Your payment will be processed securely in Nigerian Naira (NGN) at the live exchange rate. Your wallet will still be credited with the exact USD amount.",
  },
  EUR: {
    icon: "💡",
    message:
      "Note: Your payment will be processed securely in Nigerian Naira (NGN) at the live exchange rate. Your wallet will still be credited with the exact EUR amount.",
  },
  GBP: {
    icon: "💡",
    message:
      "Note: Your payment will be processed securely in Nigerian Naira (NGN) at the live exchange rate. Your wallet will still be credited with the exact GBP amount.",
  },
  JPY: {
    icon: "💡",
    message:
      "Note: Your payment will be processed securely in Nigerian Naira (NGN) at the live exchange rate. Your wallet will still be credited with the exact JPY amount.",
  },
};

interface PaymentSelectorProps {
  amount: number;
  currency: string;
  onSuccess: (status: PaymentStatus) => void;
  onError?: (error: string) => void;
  onCancel?: () => void;
  metadata?: Record<string, unknown>;
}

type PaymentStep =
  | "select"
  | "processing"
  | "grey-details"
  | "success"
  | "error";

/**
 * PaymentSelector Component
 *
 * A premium payment method selection screen that supports:
 * 1. Paystack — instant card/bank payments
 * 2. Grey — manual bank transfer fallback
 *
 * Handles the full lifecycle: method selection → initiation → verification → success.
 */
export default function PaymentSelector({
  amount,
  currency,
  onSuccess,
  onError,
  onCancel,
  metadata,
}: PaymentSelectorProps) {
  const [step, setStep] = useState<PaymentStep>("select");
  const [selectedMethod, setSelectedMethod] = useState<
    "paystack" | "grey" | "apple-pay" | null
  >(null);
  const [greyDetails, setGreyDetails] = useState<{
    reference: string;
    expiresAt: string;
    instructions: Record<string, unknown>;
  } | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isApplePaySupported, setIsApplePaySupported] = useState(false);

  // ─── Telemetry Engine ─────────────────────────────────────────
  const trackTelemetry = useCallback((event: string, payload?: any) => {
    console.log(`[Telemetry] ${event}`, payload || {});
  }, []);

  // ─── Apple Pay Support Checker ────────────────────────────────
  useEffect(() => {
    const checkApplePaySupport = () => {
      try {
        const isHttps = window.location.protocol === "https:";
        const cap = paymentCapabilities.APPLE_PAY;
        
        if (!cap || !cap.enabled) return false;
        if (cap.requiresHttps && !isHttps) return false;
        
        const currentDomain = window.location.hostname;
        if (cap.verifiedDomains && cap.verifiedDomains.length > 0) {
          const isVerified = cap.verifiedDomains.includes(currentDomain) || 
                             currentDomain === "localhost" || 
                             currentDomain === "127.0.0.1";
          if (!isVerified) return false;
        }

        // ApplePaySession and canMakePayments check
        if (typeof window === "undefined" || !("ApplePaySession" in window)) {
          return false;
        }

        const ApplePaySession = (window as any).ApplePaySession;
        if (ApplePaySession && typeof ApplePaySession.canMakePayments === "function") {
          const supported = ApplePaySession.canMakePayments();
          if (supported) {
            trackTelemetry("apple_pay_supported");
            return true;
          }
        }
      } catch (err) {
        console.warn("[ApplePaySupportCheck] failed", err);
      }
      return false;
    };

    const supported = checkApplePaySupport();
    setIsApplePaySupported(supported);
    if (supported) {
      trackTelemetry("apple_pay_button_rendered");
    }
  }, [trackTelemetry]);

  // ─── Paystack Flow ──────────────────────────────────────────

  const handlePaystack = useCallback(async (isAppleClick = false) => {
    setSelectedMethod(isAppleClick ? "apple-pay" : "paystack");
    setIsLoading(true);
    setStep("processing");

    if (isAppleClick) {
      trackTelemetry("apple_pay_session_started");
    }

    try {
      const result = await depositApi.initiatePaystack(
        amount,
        currency,
        metadata
      );

      if (result.url || result.checkoutUrl) {
        // Open Paystack checkout
        window.location.href = result.url || result.checkoutUrl;
      } else {
        throw new Error("No checkout URL received from Paystack");
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Payment initialization failed";
      
      if (isAppleClick) {
        trackTelemetry("apple_pay_failed", { error: message });
      }

      setErrorMessage(message);
      setStep("error");
      onError?.(message);
    } finally {
      setIsLoading(false);
    }
  }, [amount, currency, metadata, onError, trackTelemetry]);

  // ─── Grey Flow ──────────────────────────────────────────────

  const handleGrey = useCallback(async () => {
    setSelectedMethod("grey");
    setIsLoading(true);
    setStep("processing");

    try {
      const result = await depositApi.initiateGrey(
        amount,
        currency,
        metadata
      );

      setGreyDetails({
        reference: result.reference,
        expiresAt: result.expiresAt,
        instructions: result.instructions as unknown as Record<string, unknown>,
      });

      setStep("grey-details");
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to get bank details";
      setErrorMessage(message);
      setStep("error");
      onError?.(message);
    } finally {
      setIsLoading(false);
    }
  }, [amount, currency, metadata, onError]);

  // ─── Grey Transfer Confirmed ────────────────────────────────

  const handleGreyConfirmed = useCallback(
    (status: PaymentStatus) => {
      setStep("success");
      onSuccess(status);
    },
    [onSuccess]
  );

  // ─── Render ─────────────────────────────────────────────────

  if (step === "success") {
    return (
      <div className="ps-container">
        <div className="ps-success-card">
          <div className="ps-success-icon">✅</div>
          <h2>Payment Successful!</h2>
          <p>
            Your wallet has been credited with{" "}
            <strong>
              {currency} {amount}
            </strong>
          </p>
        </div>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="ps-container">
        <div className="ps-error-card">
          <div className="ps-error-icon">❌</div>
          <h2>Payment Failed</h2>
          <p>{errorMessage}</p>
          <button
            className="ps-retry-btn"
            onClick={() => {
              setStep("select");
              setErrorMessage("");
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (step === "grey-details" && greyDetails) {
    return (
      <GreyTransferDetails
        reference={greyDetails.reference}
        amount={amount}
        currency={currency}
        expiresAt={greyDetails.expiresAt}
        instructions={greyDetails.instructions}
        onConfirmed={handleGreyConfirmed}
        onBack={() => setStep("select")}
      />
    );
  }

  if (step === "processing") {
    return (
      <div className="ps-container">
        <div className="ps-processing-card">
          <div className="ps-spinner" />
          <h2>
            {selectedMethod === "paystack"
              ? "Redirecting to Paystack..."
              : "Loading bank details..."}
          </h2>
          <p>Please wait while we set up your payment.</p>
        </div>
      </div>
    );
  }

  // ─── Method Selection Screen ────────────────────────────────

  const routingInfo = GATEWAY_ROUTING_INFO[currency?.toUpperCase() ?? ""];
  // JPY bank transfer is blocked on the backend — hide the option to avoid a dead-end UX
  const bankTransferAvailable = currency !== "NGN" && currency?.toUpperCase() !== "JPY";

  return (
    <div className="ps-container">
      <div className="ps-header">
        <h2 className="ps-title">Choose Payment Method</h2>
        <p className="ps-subtitle">
          Pay{" "}
          <span className="ps-amount">
            {currency} {amount.toLocaleString()}
          </span>
        </p>
      </div>

      {/* Currency routing notice — only shown for non-native Paystack currencies (JPY, EUR, GBP) */}
      {routingInfo && (
        <div className="ps-routing-notice" role="note" aria-label="Payment routing information">
          <span className="ps-routing-notice-icon">{routingInfo.icon}</span>
          <p className="ps-routing-notice-text">{routingInfo.message}</p>
        </div>
      )}

      <div className="ps-methods">
        {/* Apple Pay Button */}
        {isApplePaySupported && (
          <button
            className={`ps-method-card ps-apple-pay ${isLoading ? "ps-disabled" : ""}`}
            onClick={() => handlePaystack(true)}
            disabled={isLoading}
            id="pay-with-apple-pay"
          >
            <div className="ps-method-icon">🍎</div>
            <div className="ps-method-info">
              <h3>Apple Pay</h3>
              <p>Instant • Pay securely with FaceID / TouchID</p>
            </div>
            <div className="ps-method-badge ps-recommended">Fastest</div>
            <div className="ps-method-arrow">→</div>
          </button>
        )}

        {/* Paystack Card */}
        <button
          className={`ps-method-card ps-paystack ${isLoading ? "ps-disabled" : ""}`}
          onClick={handlePaystack}
          disabled={isLoading}
          id="pay-with-paystack"
        >
          <div className="ps-method-icon">💳</div>
          <div className="ps-method-info">
            <h3>{currency === "NGN" ? "Instant Card & Bank Payment" : "Pay with Card"}</h3>
            <p>{currency === "NGN" ? "Pay securely via Bank Transfer, Card, or USSD" : "Instant • Card, Bank, USSD"}</p>
          </div>
          <div className="ps-method-badge ps-recommended">Recommended</div>
          <div className="ps-method-arrow">→</div>
        </button>

        {/* Grey Transfer Card — hidden for JPY (bank transfer not supported) */}
        {bankTransferAvailable && (
          <button
            className={`ps-method-card ps-grey ${isLoading ? "ps-disabled" : ""}`}
            onClick={handleGrey}
            disabled={isLoading}
            id="pay-with-grey"
          >
            <div className="ps-method-icon">🏦</div>
            <div className="ps-method-info">
              <h3>Bank Transfer</h3>
              <p>Manual • 1-60 min processing</p>
            </div>
            <div className="ps-method-badge ps-fallback">Fallback</div>
            <div className="ps-method-arrow">→</div>
          </button>
        )}
      </div>

      {onCancel && (
        <button className="ps-cancel-btn" onClick={onCancel}>
          Cancel
        </button>
      )}
    </div>
  );
}
