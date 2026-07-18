import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, Loader2, ArrowRight, RefreshCw, AlertTriangle, XCircle } from 'lucide-react';
import walletApi from '../api/walletApi';
import { WalletContext } from '../context/WalletContext';

interface VerificationStatus {
    success: boolean;
    status: string;
    amount?: number;
    currency?: string;
}

type UIState = 'verifying' | 'success' | 'failed' | 'timeout';

const logger_debug = (tag: string, ...args: any[]) => {
    console.log(`[Telemetry] ${tag}`, ...args);
};

export const PaymentCallback: React.FC = () => {
    const navigate = useNavigate();
    const walletContext = React.useContext(WalletContext);
    const [searchParams] = useSearchParams();
    const [uiState, setUiState] = useState<UIState>('verifying');
    const [statusData, setStatusData] = useState<VerificationStatus | null>(null);
    const [statusMessage, setStatusMessage] = useState<string>('Verifying transaction...');
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const reference = searchParams.get('reference') || searchParams.get('trxref');
    const pollCountRef = useRef(0);
    const maxPolls = 30; // 60 seconds total polling (30 * 2s)
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isStoppedRef = useRef(false);

    const handleSuccess = useCallback(async (data: VerificationStatus) => {
        isStoppedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        
        setStatusData(data);
        setUiState('success');
        setStatusMessage('Payment verified successfully!');
        
        // Refresh wallet context so balance is immediately correct
        if (walletContext) {
            try {
                await walletContext.refresh();
            } catch (err) {
                console.warn('[PaymentCallback] Context refresh failed:', err);
            }
        }
        
        // Redirect to wallet after 3 seconds
        setTimeout(() => {
            navigate('/dashboard/wallet');
        }, 3000);
    }, [walletContext, navigate]);

    const handleFailure = useCallback((msg: string) => {
        isStoppedRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        
        setUiState('failed');
        setErrorMsg(msg);
        setStatusMessage('Verification failed');
    }, []);

    const pollStatus = useCallback(async () => {
        if (!reference || isStoppedRef.current) return;

        pollCountRef.current += 1;
        setStatusMessage(`Checking payment status (Attempt ${pollCountRef.current})...`);

        try {
            // Reuses the status verification logic which proactively reconciles if pending
            const result = await walletApi.proactiveVerifyPayment(reference);
            const upperStatus = (result?.status || '').toUpperCase();

            logger_debug('[PaymentCallback] Poll Result:', upperStatus, result);

            if (['COMPLETED', 'SUCCESS', 'SUCCESSFUL'].includes(upperStatus)) {
                await handleSuccess({
                    success: true,
                    status: upperStatus,
                    amount: result.amount,
                    currency: result.currency
                });
                return;
            }

            if (['FAILED', 'CANCELLED', 'REJECTED', 'EXPIRED'].includes(upperStatus)) {
                handleFailure(`Transaction failed with status: ${upperStatus}`);
                return;
            }

            // If still pending and not timed out, poll again
            if (pollCountRef.current >= maxPolls) {
                setUiState('timeout');
                setStatusMessage('Verification timed out');
                setErrorMsg('We are still waiting for confirmation from Paystack. Please click the button below to manually retry verification.');
            } else {
                timerRef.current = setTimeout(pollStatus, 2000);
            }
        } catch (err: any) {
            console.error('[PaymentCallback] Polling error:', err);
            // Treat server errors gracefully and continue polling
            if (pollCountRef.current >= maxPolls) {
                setUiState('timeout');
                setErrorMsg('Failed to connect to the verification server. Please verify your internet connection and try again.');
            } else {
                timerRef.current = setTimeout(pollStatus, 2000);
            }
        }
    }, [reference, handleSuccess, handleFailure]);

    useEffect(() => {
        if (!reference) {
            handleFailure('No transaction reference found in callback URL.');
            return;
        }

        isStoppedRef.current = false;
        pollCountRef.current = 0;
        
        // Short initial delay before polling
        const delay = setTimeout(pollStatus, 1500);

        return () => {
            isStoppedRef.current = true;
            clearTimeout(delay);
            if (timerRef.current) clearTimeout(timerRef.current);
        };
    }, [reference, pollStatus, handleFailure]);

    const handleManualRetry = () => {
        setUiState('verifying');
        setErrorMsg(null);
        pollCountRef.current = 0;
        pollStatus();
    };

    return (
        <div className="min-h-screen w-screen bg-[#070709] bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-purple-950/20 via-black to-[#070709] flex items-center justify-center p-4">
            <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/5 bg-white/[0.02] p-8 text-center backdrop-blur-2xl shadow-[0_0_80px_rgba(168,85,247,0.05)]">
                
                {/* Decorative glow effect */}
                <div className="absolute -top-24 -left-24 h-48 w-48 rounded-full bg-purple-500/10 blur-3xl" />
                <div className="absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-emerald-500/10 blur-3xl" />

                {/* ── VERIFYING STATE ── */}
                {uiState === 'verifying' && (
                    <div className="flex flex-col items-center py-6">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 animate-ping rounded-full bg-purple-500/20 blur-md" />
                            <Loader2 className="relative h-16 w-16 text-purple-500 animate-spin" />
                        </div>
                        <h1 className="text-2xl font-semibold text-white mb-2 tracking-wide font-outfit">
                            Securing Payment
                        </h1>
                        <p className="text-purple-300/80 text-sm font-medium mb-1">
                            {statusMessage}
                        </p>
                        <p className="text-gray-500 text-xs px-6 mt-4">
                            Please do not close this window or click the back button. We are finalizing your transaction details.
                        </p>
                    </div>
                )}

                {/* ── SUCCESS STATE ── */}
                {uiState === 'success' && (
                    <div className="flex flex-col items-center py-6">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 rounded-full bg-emerald-500/20 blur-xl scale-125 animate-pulse" />
                            <div className="relative h-20 w-20 rounded-full border border-emerald-500/30 bg-emerald-500/10 flex items-center justify-center">
                                <CheckCircle2 className="h-12 w-12 text-emerald-400" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2 tracking-wide font-outfit">
                            Deposit Confirmed!
                        </h1>
                        {statusData && (
                            <div className="mb-6 rounded-2xl bg-white/[0.02] border border-white/5 py-4 px-6 w-full">
                                <div className="text-gray-400 text-xs uppercase tracking-wider mb-1">Credited Amount</div>
                                <div className="text-3xl font-bold text-emerald-400">
                                    {statusData.amount} {statusData.currency}
                                </div>
                            </div>
                        )}
                        <p className="text-gray-400 text-sm mb-6">
                            Redirecting you to your wallet page...
                        </p>
                        <button
                            onClick={() => navigate('/dashboard/wallet')}
                            className="w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-medium shadow-lg shadow-emerald-600/20 hover:shadow-emerald-500/30 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 group"
                        >
                            Return to Wallet
                            <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                        </button>
                    </div>
                )}

                {/* ── TIMEOUT STATE ── */}
                {uiState === 'timeout' && (
                    <div className="flex flex-col items-center py-6">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 rounded-full bg-amber-500/10 blur-xl" />
                            <div className="relative h-20 w-20 rounded-full border border-amber-500/30 bg-amber-500/10 flex items-center justify-center">
                                <AlertTriangle className="h-10 w-10 text-amber-400" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2 tracking-wide font-outfit">
                            Still Loading
                        </h1>
                        <p className="text-gray-400 text-sm mb-4 px-2">
                            {errorMsg}
                        </p>
                        {reference && (
                            <div className="text-[10px] font-mono text-gray-600 bg-white/[0.01] border border-white/5 px-3 py-1.5 rounded-lg mb-6 w-full truncate">
                                REF: {reference}
                            </div>
                        )}
                        <div className="w-full flex flex-col gap-3">
                            <button
                                onClick={handleManualRetry}
                                className="w-full py-3.5 px-6 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-medium shadow-lg shadow-purple-600/20 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2 group"
                            >
                                <RefreshCw className="h-4 w-4 group-hover:rotate-180 transition-transform duration-500" />
                                Check Status Again
                            </button>
                            <button
                                onClick={() => navigate('/dashboard/wallet')}
                                className="w-full py-3.5 px-6 rounded-2xl border border-white/10 hover:bg-white/5 text-gray-300 font-medium transition-all duration-300"
                            >
                                Go Back to Wallet
                            </button>
                        </div>
                    </div>
                )}

                {/* ── FAILED STATE ── */}
                {uiState === 'failed' && (
                    <div className="flex flex-col items-center py-6">
                        <div className="relative mb-6">
                            <div className="absolute inset-0 rounded-full bg-red-500/10 blur-xl" />
                            <div className="relative h-20 w-20 rounded-full border border-red-500/30 bg-red-500/10 flex items-center justify-center">
                                <XCircle className="h-11 w-11 text-red-400" />
                            </div>
                        </div>
                        <h1 className="text-2xl font-bold text-white mb-2 tracking-wide font-outfit">
                            Verification Failed
                        </h1>
                        <p className="text-red-300/80 text-sm mb-4 px-2 font-medium bg-red-500/5 py-2 rounded-xl border border-red-500/10 w-full">
                            {errorMsg}
                        </p>
                        <p className="text-gray-400 text-xs px-4 mb-6 leading-relaxed">
                            If funds were deducted from your bank account, please contact our support team immediately with the reference code.
                        </p>
                        {reference && (
                            <div className="text-[10px] font-mono text-gray-600 bg-white/[0.01] border border-white/5 px-3 py-1.5 rounded-lg mb-6 w-full truncate">
                                REF: {reference}
                            </div>
                        )}
                        <button
                            onClick={() => navigate('/dashboard/wallet')}
                            className="w-full py-3.5 px-6 rounded-2xl border border-white/10 hover:bg-white/5 text-gray-300 font-medium transition-all duration-300"
                        >
                            Return to Wallet
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PaymentCallback;
