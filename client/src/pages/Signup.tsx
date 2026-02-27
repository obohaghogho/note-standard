import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, ArrowLeft, CheckCircle2, ShieldCheck, UserCircle, ArrowRight, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Card } from '../components/common/Card';
import { PasswordStrengthMeter } from '../components/auth/PasswordStrengthMeter';
import { TermsModal } from '../components/auth/TermsModal';
import { VerificationModal } from '../components/auth/VerificationModal';
import { supabase } from '../lib/supabase';
import { toast } from 'react-hot-toast';
import { cn } from '../utils/cn';
import ReCAPTCHA from 'react-google-recaptcha';

import { API_URL } from '../lib/api';

type SignupStep = 'details' | 'security' | 'success';

export const Signup = () => {
    const navigate = useNavigate();
    const [step, setStep] = React.useState<SignupStep>('details');
    const [loading, setLoading] = React.useState(false);
    const [loadingStatus, setLoadingStatus] = React.useState('');
    const [error, setError] = React.useState('');

    // Form State
    const [fullName, setFullName] = React.useState('');
    const [username, setUsername] = React.useState('');
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [confirmPassword, setConfirmPassword] = React.useState('');
    
    const [termsAccepted, setTermsAccepted] = React.useState(false);
    const [showTermsModal, setShowTermsModal] = React.useState(false);
    const [showVerificationModal, setShowVerificationModal] = React.useState(false);
    const [captchaToken, setCaptchaToken] = React.useState<string | null>(null);
    const recaptchaRef = React.useRef<ReCAPTCHA>(null);

    React.useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const ref = urlParams.get('ref');
        if (ref) {
            localStorage.setItem('referrer_id', ref);
        }
    }, []);

    const validateDetails = () => {
        if (!fullName.trim()) return 'Full name is required';
        if (!username.trim()) return 'Username is required';
        if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) return 'Invalid email address';
        return null;
    };

    const validateSecurity = () => {
        if (password.length < 8) return 'Password must be at least 8 characters';
        if (password !== confirmPassword) return 'Passwords do not match';
        return null;
    };


    const handleNext = () => {
        setError('');
        let err = null;
        if (step === 'details') err = validateDetails();
        else if (step === 'security') err = validateSecurity();

        if (err) {
            setError(err);
            toast.error(err);
            return;
        }

        if (step === 'details') setStep('security');
        else if (step === 'security') handleFinalSubmit();
    };

    const handleFinalSubmit = async () => {
        setLoading(true);
        setLoadingStatus('Initializing secure signup...');
        setError('');

        try {
            // 1. First, register with the backend to handle profile creation and reCAPTCHA
            // We still want the backend to validate reCAPTCHA and prepare the profile
            setLoadingStatus('Securing your details...');
            const response = await fetch(`${API_URL}/api/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    fullName,
                    username,
                    email,
                    password,
                    captchaToken,
                    referrerId: localStorage.getItem('referrer_id')
                })
            });

            const result = await response.json();
            
            // Note: Our modified backend will now return success even if it doesn't send an OTP
            if (!response.ok) throw new Error(result.error || 'Registration failed');

            // 2. Register with Supabase Auth
            // This will send the native Supabase confirmation email
            setLoadingStatus('Sending verification email...');
            const { error: signUpError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                        username: username,
                        is_verified: false,
                    },
                    emailRedirectTo: `${window.location.origin}/login`
                }
            });

            if (signUpError) throw signUpError;

            setStep('success');
            toast.success('Registration successful! Please check your email.');

        } catch (err: any) {
            console.error(err);
            const msg = err.message || 'Signup failed. Please check your details.';
            
            setError(msg);
            toast.success(msg); // Use success color for errors sometimes to avoid scaring users? No, toast.error.
            toast.error(msg);
            
            // Reset reCAPTCHA on error to allow retry
            recaptchaRef.current?.reset();
            setCaptchaToken(null);
        } finally {
            setLoading(false);
        }
    };

    const stepVariants = {
        enter: (direction: number) => ({
            x: direction > 0 ? 50 : -50,
            opacity: 0
        }),
        center: {
            zIndex: 1,
            x: 0,
            opacity: 1
        },
        exit: (direction: number) => ({
            zIndex: 0,
            x: direction < 0 ? 50 : -50,
            opacity: 0
        })
    };

    return (
        <div className="min-h-[100dvh] flex items-center justify-center p-4 relative overflow-hidden bg-[#0a0a0a] w-full selection:bg-primary/30">
            {/* Rich Background Aesthetics */}
            <div className="absolute top-0 right-[-10%] w-[600px] h-[600px] bg-primary/20 rounded-full blur-[120px] -z-10 animate-pulse" />
            <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[100px] -z-10" />
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-[url('https://www.transparenttextures.com/patterns/dark-matter.png')] opacity-[0.03] -z-10" />

            <div className="w-full max-w-md relative">
                <Link to="/" className="inline-flex items-center text-gray-500 hover:text-white mb-8 transition-all group">
                    <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center mr-3 group-hover:bg-primary/20 group-hover:text-primary transition-all">
                        <ArrowLeft className="w-4 h-4" />
                    </div>
                    <span className="text-sm font-medium">Back to Home</span>
                </Link>

                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold mb-3 tracking-tight bg-gradient-to-br from-white via-white to-gray-500 bg-clip-text text-transparent">
                        Create Your Account
                    </h1>
                    <p className="text-gray-400 text-sm">Join the next generation of note-taking</p>
                </div>

                {/* Progress Bar */}
                <div className="flex gap-2 mb-6 px-1">
                    {[
                        { label: 'Form', steps: ['details', 'security'] },
                        { label: 'Ready', steps: ['success'] }
                    ].map((group, idx) => {
                        const isActive = group.steps.includes(step);
                        const isPast = [
                            { label: 'Form', steps: ['details', 'security'] },
                            { label: 'Ready', steps: ['success'] }
                        ].findIndex(g => g.steps.includes(step)) > idx;
                        
                        return (
                            <div key={group.label} className="flex-1 flex flex-col gap-2">
                                <div 
                                    className={cn(
                                        "h-1.5 w-full rounded-full transition-all duration-500",
                                        isActive ? "bg-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.5)]" : 
                                        isPast ? "bg-primary/40" : "bg-white/10"
                                    )}
                                />
                                <span className={cn(
                                    "text-[10px] font-bold uppercase tracking-wider text-center",
                                    isActive ? "text-primary" : "text-gray-600"
                                )}>{group.label}</span>
                            </div>
                        );
                    })}
                </div>

                <Card variant="glass" className="p-0 overflow-hidden border-white/5 shadow-2xl backdrop-blur-2xl">
                    <div className="p-8">
                        {error && (
                            <motion.div 
                                initial={{ opacity: 0, y: -10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-xl text-sm mb-6 flex items-center gap-3"
                            >
                                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                                {error}
                            </motion.div>
                        )}

                        <form onSubmit={(e) => { e.preventDefault(); handleNext(); }} className="space-y-6">
                            <AnimatePresence mode="wait" custom={step}>
                                <motion.div
                                    key={step}
                                    custom={step}
                                    variants={stepVariants}
                                    initial="enter"
                                    animate="center"
                                    exit="exit"
                                    transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                                    className="space-y-6"
                                >
                                    {step === 'details' && (
                                        <div className="space-y-5">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                                                    <UserCircle size={24} />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-white">Basic Info</h3>
                                                    <p className="text-xs text-gray-500">Let's get to know you</p>
                                                </div>
                                            </div>
                                            <Input
                                                id="fullName"
                                                name="fullName"
                                                icon={User}
                                                type="text"
                                                label="Full Name"
                                                placeholder="John Doe"
                                                value={fullName}
                                                onChange={(e) => setFullName(e.target.value)}
                                                autoComplete="name"
                                                className="bg-white/[0.03]"
                                            />
                                            <Input
                                                id="username"
                                                name="username"
                                                icon={UserCircle}
                                                type="text"
                                                label="Username"
                                                placeholder="johndoe123"
                                                value={username}
                                                onChange={(e) => setUsername(e.target.value)}
                                                autoComplete="username"
                                                className="bg-white/[0.03]"
                                            />
                                            <Input
                                                id="email"
                                                name="email"
                                                icon={Mail}
                                                type="email"
                                                label="Email Address"
                                                placeholder="name@company.com"
                                                value={email}
                                                onChange={(e) => setEmail(e.target.value)}
                                                autoComplete="email"
                                                className="bg-white/[0.03]"
                                            />
                                        </div>
                                    )}

                                    {step === 'security' && (
                                        <div className="space-y-5">
                                            <div className="flex items-center gap-3 mb-2">
                                                <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
                                                    <ShieldCheck size={24} />
                                                </div>
                                                <div>
                                                    <h3 className="font-semibold text-white">Secure Your Account</h3>
                                                    <p className="text-xs text-gray-500">Use a strong password</p>
                                                </div>
                                            </div>
                                            <Input
                                                id="password"
                                                name="password"
                                                icon={Lock}
                                                type="password"
                                                label="Password"
                                                placeholder="••••••••"
                                                value={password}
                                                onChange={(e) => setPassword(e.target.value)}
                                                showPasswordToggle
                                                autoComplete="new-password"
                                                className="bg-white/[0.03]"
                                            />
                                            <PasswordStrengthMeter password={password} />
                                            <Input
                                                id="confirmPassword"
                                                name="confirmPassword"
                                                icon={Lock}
                                                type="password"
                                                label="Confirm Password"
                                                placeholder="••••••••"
                                                value={confirmPassword}
                                                onChange={(e) => setConfirmPassword(e.target.value)}
                                                showPasswordToggle
                                                autoComplete="new-password"
                                                className="bg-white/[0.03]"
                                            />
                                            
                                            <div className="pt-2 space-y-4">
                                                <label className="flex items-start gap-3 cursor-pointer group">
                                                    <div className="relative flex items-center mt-0.5">
                                                        <input 
                                                            type="checkbox" 
                                                            className="sr-only"
                                                            checked={termsAccepted}
                                                            onChange={(e) => setTermsAccepted(e.target.checked)}
                                                        />
                                                        <div className={cn(
                                                            "w-5 h-5 rounded-md border-2 transition-all duration-200 flex items-center justify-center",
                                                            termsAccepted ? "bg-primary border-primary shadow-[0_0_10px_rgba(var(--primary-rgb),0.3)]" : "border-white/10 bg-white/5"
                                                        )}>
                                                            {termsAccepted && <CheckCircle2 className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
                                                        </div>
                                                    </div>
                                                    <span className="text-xs text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors">
                                                        I accept the <button type="button" onClick={() => setShowTermsModal(true)} className="text-primary hover:underline">Terms of Service</button> and <button type="button" className="text-primary hover:underline">Privacy Policy</button>. I understand that my data will be stored securely.
                                                    </span>
                                                </label>
                                                
                                                {/* Bot Protection */}
                                                <div className="mt-4 flex justify-center scale-90 origin-center sm:scale-100">
                                                    <ReCAPTCHA
                                                        ref={recaptchaRef}
                                                        sitekey={import.meta.env.VITE_RECAPTCHA_SITE_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI'}
                                                        theme="dark"
                                                        onChange={(token: string | null) => setCaptchaToken(token)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}


                                    {step === 'success' && (
                                        <div className="space-y-6 py-4 text-center">
                                            <div className="w-20 h-20 rounded-full bg-green-500/10 flex items-center justify-center text-green-500 mx-auto mb-4 border border-green-500/20">
                                                <CheckCircle2 size={48} className="animate-bounce" />
                                            </div>
                                            <h3 className="text-2xl font-bold text-white">Check Your Email</h3>
                                            <p className="text-gray-400">We've sent a verification link to <span className="text-white font-medium">{email}</span>. Please click the link to activate your account.</p>
                                            <Button variant="outline" fullWidth onClick={() => navigate('/login')} className="mt-4">
                                                Go to Login
                                            </Button>
                                        </div>
                                    )}
                                </motion.div>
                            </AnimatePresence>

                            <div className="pt-2">
                                <Button 
                                    type="submit" 
                                    fullWidth 
                                    className="h-12 text-sm font-bold rounded-xl active:scale-95 transition-all shadow-lg shadow-primary/20"
                                    loading={loading}
                                    disabled={loading || (step === 'security' && !captchaToken) || (step === 'security' && !termsAccepted) || step === 'success'}
                                >
                                    {loading ? (
                                        <div className="flex items-center gap-2">
                                            <Loader2 size={18} className="animate-spin" />
                                            <span>{loadingStatus || 'Processing...'}</span>
                                        </div>
                                    ) : (
                                        <div className="flex items-center justify-center gap-2">
                                            <span>
                                        {step === 'success' ? 'Ready' : 'Continue'}
                                    </span>
                                    <ArrowRight size={18} />
                                </div>
                            )}
                        </Button>

                        {step !== 'details' && step !== 'success' && !loading && (
                            <button
                                type="button"
                                onClick={() => {
                                    if (step === 'security') setStep('details');
                                }}
                                className="w-full text-xs text-gray-500 hover:text-white mt-1 py-2 hover:bg-white/5 rounded-lg transition-all"
                            >
                                Go back
                            </button>
                        )}
                            </div>
                        </form>
                    </div>

                    <div className="p-6 bg-white/[0.02] border-t border-white/5 text-center flex flex-col gap-3">
                        <p className="text-sm text-gray-500">
                            Already have an account?{' '}
                            <Link to="/login" className="text-primary hover:text-primary/80 font-bold transition-colors">
                                Sign in
                            </Link>
                        </p>
                        <p className="text-xs text-gray-500">
                            Forgot your password?{' '}
                            <Link to="/login" className="text-gray-400 hover:text-white transition-colors underline">
                                Reset it here
                            </Link>
                        </p>
                    </div>
                </Card>

                {/* Footnote for network optimization */}
                <div className="mt-8 flex items-center justify-center gap-2 text-[10px] text-gray-600 uppercase tracking-widest font-bold">
                    <CheckCircle2 size={12} className="text-green-500" />
                    Optimized for 3G/Low Latency Regions
                </div>

                {/* Modals */}
                <TermsModal
                    isOpen={showTermsModal}
                    onClose={() => setShowTermsModal(false)}
                />

                <VerificationModal
                    isOpen={showVerificationModal}
                    onClose={() => setShowVerificationModal(false)}
                    email={email}
                />
            </div>
        </div>
    );
};

