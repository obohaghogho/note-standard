import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, ArrowRight, ShieldCheck, RefreshCw, CheckCircle2, ArrowLeft, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Card } from '../components/common/Card';
import { API_URL } from '../lib/api';
import toast from 'react-hot-toast';

type VerifySubStep = 'email' | 'success';

export const CompleteVerification = () => {
    const { user, profile, refreshProfile, signOut } = useAuth();
    const navigate = useNavigate();
    
    const [step, setStep] = useState<VerifySubStep>('email');
    const [loading, setLoading] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState('');
    const [emailOtp, setEmailOtp] = useState('');
    const [error, setError] = useState('');
    
    // Ref for auto-focus
    const emailInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (profile?.is_verified) {
            navigate('/dashboard');
        }
        // Auto-focus email field
        setTimeout(() => emailInputRef.current?.focus(), 500);
    }, [profile, navigate]);

    const handleResend = async () => {
        if (!user?.email || loading) return;
        setLoading(true);
        setLoadingStatus('Resending code...');
        try {
            const response = await fetch(`${API_URL}/api/auth/resend-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: user.email })
            });
            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Resend failed');
            toast.success('A new verification code has been sent to your email!');
            setError('');
        } catch (err: any) {
            toast.error(err.message || 'Resend failed');
        } finally {
            setLoading(false);
            setLoadingStatus('');
        }
    };

    const handleVerify = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!user?.email) return;

        setLoading(true);
        setLoadingStatus('Activating account...');
        try {
            const response = await fetch(`${API_URL}/api/auth/verify-otp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: user.email,
                    emailOtp: emailOtp
                })
            });

            const result = await response.json();
            if (!response.ok) {
                if (result.expired) {
                    setError('Code has expired. Please click "Resend" below.');
                }
                throw new Error(result.error || 'Verification failed');
            }

            setStep('success');
            toast.success('Account activated!');
            await refreshProfile();
            setTimeout(() => navigate('/dashboard'), 2000);
        } catch (err: any) {
            toast.error(err.message || 'Verification failed');
            setError(err.message);
        } finally {
            setLoading(false);
            setLoadingStatus('');
        }
    };

    return (
        <div className="min-h-[100dvh] bg-[#050505] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background elements */}
            <div className="absolute top-0 left-1/4 w-full max-w-[800px] h-[500px] bg-primary/10 rounded-full blur-[120px] -z-10" />
            <div className="absolute bottom-0 right-1/4 w-full max-w-[600px] h-[500px] bg-purple-500/5 rounded-full blur-[100px] -z-10" />

            <div className="w-full max-w-md relative">
                <button 
                    onClick={() => signOut()}
                    className="inline-flex items-center text-gray-500 hover:text-white mb-8 transition-all group"
                >
                    <ArrowLeft size={16} className="mr-2 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-medium">Logged in as {user?.email} (Not you?)</span>
                </button>

                <Card variant="glass" className="p-0 overflow-hidden border-white/5 shadow-2xl">
                    <div className="p-8">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={step}
                                initial={{ opacity: 0, x: 20 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: -20 }}
                                transition={{ duration: 0.3 }}
                            >
                                {step === 'email' && (
                                    <div className="space-y-6">
                                        <div className="text-center space-y-2">
                                            <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mx-auto mb-4 border border-primary/20">
                                                <Mail size={32} />
                                            </div>
                                            <h3 className="text-xl font-bold text-white tracking-tight">Email Verification</h3>
                                            <p className="text-sm text-gray-400">Enter the 6-digit code sent to your email</p>
                                        </div>

                                        <form onSubmit={handleVerify} className="space-y-4">
                                            <Input
                                                ref={emailInputRef}
                                                id="emailOtp"
                                                name="emailOtp"
                                                placeholder="000000"
                                                value={emailOtp}
                                                onChange={(e) => {
                                                    const val = e.target.value;
                                                    setEmailOtp(val);
                                                    if (val.length === 6) {
                                                        handleVerify();
                                                    }
                                                }}
                                                maxLength={6}
                                                className="text-center text-2xl tracking-[0.5em] font-mono bg-white/[0.03]"
                                                disabled={loading}
                                            />
                                            <Button 
                                                type="submit"
                                                fullWidth 
                                                loading={loading}
                                                disabled={emailOtp.length < 6 || loading}
                                                className="h-12 text-sm font-bold rounded-xl"
                                            >
                                                {loading ? (
                                                    <div className="flex items-center gap-2">
                                                        <Loader2 size={18} className="animate-spin" />
                                                        <span>{loadingStatus}</span>
                                                    </div>
                                                ) : (
                                                    <>
                                                        Verify & Activate
                                                        <ArrowRight size={18} className="ml-2" />
                                                    </>
                                                )}
                                            </Button>
                                        </form>
                                    </div>
                                )}

                                {step === 'success' && (
                                    <div className="space-y-6 py-6 text-center">
                                        <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 mx-auto mb-4 border border-green-500/20 shadow-[0_0_30px_rgba(34,197,94,0.1)]">
                                            <CheckCircle2 size={48} className="animate-bounce" />
                                        </div>
                                        <h3 className="text-2xl font-bold text-white tracking-tight">Everything set!</h3>
                                        <p className="text-gray-400">Your account is now fully active. Redirecting to workspace...</p>
                                    </div>
                                )}
                            </motion.div>
                        </AnimatePresence>

                        {error && (
                            <motion.div 
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="mt-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-xs text-center"
                            >
                                {error}
                            </motion.div>
                        )}
                    </div>

                    {step !== 'success' && (
                        <div className="p-6 bg-white/[0.02] border-t border-white/5 text-center">
                            <p className="text-xs text-gray-500 mb-3">Didn't receive the code?</p>
                            <button
                                type="button"
                                onClick={handleResend}
                                disabled={loading}
                                className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-bold transition-all text-sm disabled:opacity-50"
                            >
                                <RefreshCw size={14} className={loading && loadingStatus.includes('Resend') ? 'animate-spin' : ''} />
                                Resend Email Code
                            </button>
                        </div>
                    )}
                </Card>

                <div className="mt-8 flex items-center justify-center gap-2 text-[10px] text-gray-600 uppercase tracking-widest font-bold">
                    <ShieldCheck size={12} className="text-primary" />
                    Secure Identity Verification Active
                </div>
            </div>
        </div>
    );
};

export default CompleteVerification;
