import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, ArrowRight, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from '../components/common/Button';
import walletApi from '../api/walletApi';
import { WalletContext } from '../context/WalletContext';

interface DepositStatus {
    id: string;
    status: string;
    amount: number;
    currency: string;
}

type UIStatus = 'loading' | 'success' | 'timed_out' | 'failed' | 'verifying';

const SUCCESS_STATES  = new Set(['COMPLETED', 'SUCCESS', 'SUCCESSFUL', 'ALREADY_COMPLETED']);
const FAILURE_STATES  = new Set(['FAILED', 'CANCELLED', 'REJECTED', 'ABANDONED', 'EXPIRED']);

// How often to call the fast DB-read status endpoint
const STATUS_POLL_INTERVAL_MS = 3000;
// How often to call the explicit Paystack verify endpoint
const VERIFY_INTERVAL_MS = 20000;
// Give up automatic polling after 2 minutes — then let user click "Verify Now"
const POLLING_TIMEOUT_MS = 120000;

export const ActivitySuccess: React.FC = () => {
    const navigate = useNavigate();
    const walletContext = React.useContext(WalletContext);
    const [searchParams] = useSearchParams();
    const [uiStatus, setUiStatus] = useState<UIStatus>('loading');
    const [deposit, setDeposit] = useState<DepositStatus | null>(null);
    const [verifyError, setVerifyError] = useState<string | null>(null);

    const stoppedRef = useRef(false);
    const startTimeRef = useRef(Date.now());
    const lastVerifyRef = useRef(0);

    const reference = searchParams.get('reference');
    const txRef = searchParams.get('tx_ref');

    const resolveRef = useCallback((): string | null => {
        const ref = reference || txRef;
        if (ref) return ref;

        const stored = localStorage.getItem('pendingDepositReference');
        const storedTime = localStorage.getItem('pendingDepositTime');
        if (stored && storedTime && (Date.now() - parseInt(storedTime)) < 30 * 60 * 1000) {
            return stored;
        }
        return null;
    }, [reference, txRef]);

    // ── Core finalization helper ──────────────────────────────────
    const handleSuccess = useCallback(async (data: any) => {
        stoppedRef.current = true;
        setDeposit(data);
        setUiStatus('success');
        localStorage.removeItem('pendingDepositReference');
        localStorage.removeItem('pendingDepositTime');
        if (walletContext) await walletContext.refresh();
        setTimeout(() => navigate('/dashboard/activity'), 3000);
    }, [walletContext, navigate]);

    const handleFailure = useCallback(() => {
        stoppedRef.current = true;
        setUiStatus('failed');
        localStorage.removeItem('pendingDepositReference');
        localStorage.removeItem('pendingDepositTime');
    }, []);

    // ── Manual "Verify Now" — called by the button ─────────────
    const handleManualVerify = useCallback(async () => {
        const pollingRef = resolveRef();
        if (!pollingRef) return;

        setUiStatus('verifying');
        setVerifyError(null);
        try {
            const result = await walletApi.triggerVerification(pollingRef);
            const upper = (result.status || '').toUpperCase();
            if (SUCCESS_STATES.has(upper)) {
                await handleSuccess(result);
            } else if (FAILURE_STATES.has(upper)) {
                handleFailure();
            } else {
                setUiStatus('timed_out');
                setVerifyError('Payment is still processing on Paystack\'s side. Please wait a moment and try again.');
            }
        } catch (err: any) {
            setUiStatus('timed_out');
            setVerifyError(err.message || 'Could not reach verification server. Check your connection.');
        }
    }, [resolveRef, handleSuccess, handleFailure]);

    // ── Background polling effect ─────────────────────────────────
    useEffect(() => {
        stoppedRef.current = false;
        startTimeRef.current = Date.now();
        lastVerifyRef.current = 0;

        const pollingRef = resolveRef();
        if (!pollingRef) {
            setUiStatus('failed');
            return;
        }

        let statusTimer: ReturnType<typeof setTimeout>;

        const pollStatus = async () => {
            if (stoppedRef.current) return;

            const elapsed = Date.now() - startTimeRef.current;

            // ── Timeout: stop auto-polling, show manual button ────────────
            if (elapsed > POLLING_TIMEOUT_MS) {
                console.warn(`[Polling] Timeout for ref: ${pollingRef} (elapsed: ${elapsed}ms)`);
                setUiStatus('timed_out');
                return; // stops scheduling further polls
            }

            // ── Track 1: Fast DB status check ──────────────────────────
            try {
                const data = await walletApi.proactiveVerifyPayment(pollingRef);
                if (data && !stoppedRef.current) {
                    const upper = (data.status || '').toUpperCase();
                    if (SUCCESS_STATES.has(upper)) { await handleSuccess(data); return; }
                    if (FAILURE_STATES.has(upper))  { handleFailure(); return; }
                }
            } catch (err: any) {
                // Network error during status check — keep retrying
                console.warn('[Polling] Status check error:', err.message);
            }

            if (stoppedRef.current) return;

            // ── Track 2: Paystack explicit verify ───────────────────────────
            // Always call on first poll (lastVerifyRef === 0) and then every 20s.
            // This ensures immediate finalization in local dev (no webhook delivery).
            const now = Date.now();
            const isFirstPoll = lastVerifyRef.current === 0;
            if (isFirstPoll || now - lastVerifyRef.current >= VERIFY_INTERVAL_MS) {
                lastVerifyRef.current = now;
                try {
                    const verified = await walletApi.triggerVerification(pollingRef);
                    if (verified && !stoppedRef.current) {
                        const upper = (verified.status || '').toUpperCase();
                        if (SUCCESS_STATES.has(upper)) { await handleSuccess(verified); return; }
                        if (FAILURE_STATES.has(upper))  { handleFailure(); return; }
                    }
                } catch (err: any) {
                    console.warn('[Polling] Verify attempt error:', err.message);
                }
            }

            if (stoppedRef.current) return;

            // Schedule next DB poll
            statusTimer = setTimeout(pollStatus, STATUS_POLL_INTERVAL_MS);
        };

    // ── Initial delay to allow Supabase session to re-hydrate after redirect ──
    // After the Paystack redirect, the page reloads and the session is loaded
    // from localStorage. This takes ~1-2s. Without this delay, the first few
    // polling requests are sent without an auth token, causing 401 errors.
    const startDelay = setTimeout(() => {
      pollStatus();
    }, 1500);

    return () => {
      stoppedRef.current = true;
      clearTimeout(startDelay);
      clearTimeout(statusTimer);
    };
  }, [reference, txRef]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleGoToActivity = async () => {
        if (walletContext) await walletContext.refresh();
        navigate('/dashboard/activity');
    };

    const pollingRef = resolveRef();

    return (
        <div className="min-h-[100dvh] bg-[#0a0a0a] flex items-center justify-center p-4 w-full max-w-full overflow-hidden">
            <div className="bg-gray-800 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl border border-gray-700/50">

                {/* Loading / polling */}
                {(uiStatus === 'loading') && (
                    <>
                        <Loader2 className="w-16 h-16 text-purple-500 animate-spin mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-white mb-2 font-outfit">Processing Payment</h1>
                        <p className="text-gray-400">Confirming your transaction with Paystack…</p>
                        <p className="text-gray-600 text-xs mt-3">This usually takes less than 30 seconds.</p>
                    </>
                )}

                {/* Manual verify in progress */}
                {uiStatus === 'verifying' && (
                    <>
                        <Loader2 className="w-16 h-16 text-blue-500 animate-spin mx-auto mb-4" />
                        <h1 className="text-2xl font-bold text-white mb-2 font-outfit">Verifying with Paystack…</h1>
                        <p className="text-gray-400">Checking payment status directly. Please wait.</p>
                    </>
                )}

                {/* Success */}
                {uiStatus === 'success' && (
                    <>
                        <div className="w-16 h-16 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-green-500/30">
                            <CheckCircle2 className="w-10 h-10 text-green-500" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2 font-outfit">Payment Confirmed!</h1>
                        {deposit && (
                            <p className="text-gray-400 mb-6">
                                {deposit.amount} {deposit.currency} has been credited to your account.
                            </p>
                        )}
                        <Button onClick={handleGoToActivity} className="w-full bg-green-600 hover:bg-green-700">
                            View Activity <ArrowRight className="ml-2" size={18} />
                        </Button>
                    </>
                )}

                {/* Timed out — show manual verify button */}
                {uiStatus === 'timed_out' && (
                    <>
                        <div className="w-16 h-16 bg-yellow-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-yellow-500/30">
                            <AlertCircle className="w-10 h-10 text-yellow-400" />
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2 font-outfit">Still Processing</h1>
                        <p className="text-gray-400 mb-2">
                            Your payment was received by Paystack. We're waiting for the final confirmation.
                        </p>
                        {verifyError && (
                            <p className="text-red-400 text-sm mb-3 bg-red-500/10 rounded-lg px-3 py-2">
                                {verifyError}
                            </p>
                        )}
                        {pollingRef && (
                            <p className="text-gray-600 text-xs mb-5 font-mono break-all">Ref: {pollingRef}</p>
                        )}
                        <div className="flex flex-col gap-3">
                            <Button
                                onClick={handleManualVerify}
                                className="w-full bg-purple-600 hover:bg-purple-700"
                            >
                                <RefreshCw className="mr-2" size={16} />
                                Verify Payment Now
                            </Button>
                            <Button onClick={handleGoToActivity} variant="secondary" className="w-full border-gray-600">
                                Check Activity Later <ArrowRight className="ml-2" size={18} />
                            </Button>
                        </div>
                    </>
                )}

                {/* Failed */}
                {uiStatus === 'failed' && (
                    <>
                        <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/30">
                            <span className="text-3xl">❌</span>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2 font-outfit">Payment Failed</h1>
                        <p className="text-gray-400 mb-6 font-light">
                            Your payment was not completed. If you were charged, contact support with reference: <br />
                            <code className="bg-black/30 px-2 py-1 rounded text-xs mt-2 inline-block text-red-400">
                                {reference || txRef || 'N/A'}
                            </code>
                        </p>
                        <Button onClick={handleGoToActivity} variant="secondary" className="w-full border-gray-600">
                            Back to Activity
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
};

export default ActivitySuccess;
