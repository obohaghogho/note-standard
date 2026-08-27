import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShieldCheck, Lock, AlertCircle, CheckCircle2, X, RefreshCw, ArrowRight } from 'lucide-react';
import walletApi from '@/api/walletApi';
import { useWallet } from '../../hooks/useWallet';

interface WithdrawalOtpModalProps {
  isOpen: boolean;
  onClose: () => void;
  withdrawalReference: string;
  fincraReference?: string;
  traceId?: string;
  amount: number;
  currency: string;
  accountName: string;
  accountNumberMasked: string;
  bankName: string;
  onSuccess?: (result: any) => void;
}

export const WithdrawalOtpModal: React.FC<WithdrawalOtpModalProps> = ({
  isOpen,
  onClose,
  withdrawalReference,
  fincraReference,
  traceId,
  amount,
  currency,
  accountName,
  accountNumberMasked,
  bankName,
  onSuccess,
}) => {
  const { refresh } = useWallet();
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendCountdown, setResendCountdown] = useState(30);
  const [resendMsg, setResendMsg] = useState<string | null>(null);
  const [verifiedSuccess, setVerifiedSuccess] = useState<any | null>(null);

  // Resend Timer Effect
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (resendCountdown > 0) {
      timer = setInterval(() => setResendCountdown(prev => prev - 1), 1000);
    }
    return () => clearInterval(timer);
  }, [resendCountdown]);

  if (!isOpen) return null;

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6 || loading) return;

    setLoading(true);
    setError(null);

    try {
      const result = await walletApi.verifyWithdrawalOtp({
        otp,
        withdrawal_reference: withdrawalReference,
        fincra_reference: fincraReference,
        trace_id: traceId,
      });

      if (result.success || result.status === 'SUCCESSFUL' || result.status === 'PROCESSING') {
        setVerifiedSuccess(result);
        await refresh();
        if (onSuccess) onSuccess(result);
      } else {
        throw new Error(result.message || 'OTP verification failed. Please try again.');
      }
    } catch (err: any) {
      console.error('[WithdrawalOtpModal] Verification error:', err);
      const msg = err.response?.data?.error || err.message || 'Invalid or expired OTP. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (resendCountdown > 0 || resending) return;

    setResending(true);
    setError(null);
    setResendMsg(null);

    try {
      const res = await walletApi.resendWithdrawalOtp({
        withdrawal_reference: withdrawalReference,
        fincra_reference: fincraReference,
      });
      setResendMsg(res.message || 'A new verification code has been sent.');
      setResendCountdown(60);
    } catch (err: any) {
      console.error('[WithdrawalOtpModal] Resend error:', err);
      setError(err.response?.data?.error || err.message || 'Failed to resend OTP.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden text-gray-100"
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-800 flex items-center justify-between bg-gray-900/50">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-500/10 text-orange-500 rounded-xl border border-orange-500/20">
              <ShieldCheck size={22} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Withdrawal Security Verification</h3>
              <p className="text-xs text-gray-400">Enter the 6-digit OTP sent by Fincra</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-1.5 text-gray-400 hover:text-white rounded-lg hover:bg-gray-800 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {verifiedSuccess ? (
            /* Success View */
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle2 size={36} />
              </div>
              <div>
                <h4 className="text-xl font-bold text-white">Withdrawal In Progress</h4>
                <p className="text-sm text-gray-400 mt-1">
                  Your OTP was verified successfully. Funds will arrive in your bank account shortly.
                </p>
              </div>
              <div className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 text-xs font-mono text-left space-y-1">
                <div className="flex justify-between text-gray-400">
                  <span>Reference:</span>
                  <span className="text-orange-400 font-semibold">{withdrawalReference}</span>
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>Amount:</span>
                  <span className="text-white">{amount.toLocaleString()} {currency}</span>
                </div>
              </div>
              <button
                onClick={() => {
                  onClose();
                  refresh();
                }}
                className="w-full py-3 bg-orange-500 hover:bg-orange-600 font-semibold text-white rounded-xl transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
              >
                <span>Return to Wallet</span>
                <ArrowRight size={16} />
              </button>
            </div>
          ) : (
            /* OTP Verification Form */
            <form onSubmit={handleVerify} className="space-y-5">
              {/* Summary Details */}
              <div className="bg-gray-800/40 border border-gray-800 rounded-xl p-4 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Amount to Withdraw:</span>
                  <span className="text-white font-semibold">{amount.toLocaleString()} {currency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Destination Bank:</span>
                  <span className="text-gray-200">{bankName || 'Bank Account'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Account Name:</span>
                  <span className="text-gray-200">{accountName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Account Number:</span>
                  <span className="text-gray-300 font-mono">{accountNumberMasked}</span>
                </div>
                <div className="flex justify-between border-t border-gray-700/50 pt-2 mt-2">
                  <span className="text-gray-400">Reference:</span>
                  <span className="text-orange-400 font-mono font-semibold truncate max-w-[180px]">{withdrawalReference}</span>
                </div>
              </div>

              {/* Error Alert */}
              {error && (
                <div className="p-3.5 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-400 text-xs">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Resend Toast */}
              {resendMsg && (
                <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-emerald-400 text-xs">
                  <CheckCircle2 size={16} />
                  <span>{resendMsg}</span>
                </div>
              )}

              {/* OTP Input */}
              <div className="space-y-2">
                <label htmlFor="withdrawal-otp-input" className="block text-xs font-medium text-gray-300">
                  Enter 6-Digit Verification Code
                </label>
                <div className="relative">
                  <input
                    id="withdrawal-otp-input"
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    autoFocus
                    className="w-full py-3.5 px-4 bg-gray-950 border border-gray-800 focus:border-orange-500 focus:ring-1 focus:ring-orange-500 rounded-xl text-center text-2xl font-mono tracking-[0.5em] text-white placeholder-gray-700 outline-none transition-all"
                  />
                  <Lock size={16} className="absolute right-3.5 top-4 text-gray-600 pointer-events-none" />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-3 pt-2">
                <button
                  type="submit"
                  disabled={otp.length < 6 || loading}
                  className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed font-semibold text-white rounded-xl transition-all shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Verifying Code...</span>
                    </>
                  ) : (
                    <span>Confirm & Authorize Payout</span>
                  )}
                </button>

                <div className="flex items-center justify-between text-xs pt-1">
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resendCountdown > 0 || resending}
                    className="text-orange-400 hover:text-orange-300 disabled:text-gray-500 font-medium transition-colors flex items-center gap-1"
                  >
                    <RefreshCw size={12} className={resending ? 'animate-spin' : ''} />
                    {resendCountdown > 0
                      ? `Resend Code in ${resendCountdown}s`
                      : resending
                      ? 'Sending Code...'
                      : 'Resend Verification Code'}
                  </button>

                  <button
                    type="button"
                    onClick={onClose}
                    disabled={loading}
                    className="text-gray-400 hover:text-gray-200 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  );
};
