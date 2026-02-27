import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowLeft } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Card } from '../components/common/Card';
import { supabase } from '../lib/supabase';
import { API_URL } from '../lib/api';
import { toast } from 'react-hot-toast';

export const Login = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = React.useState(false);
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [error, setError] = React.useState('');
    const [rememberMe, setRememberMe] = React.useState(true);
    const [resetLoading, setResetLoading] = React.useState(false);
    const [resetSent, setResetSent] = React.useState(false);

    // Ref to track if component is mounted (for StrictMode cleanup)
    const mountedRef = React.useRef(true);

    React.useEffect(() => {
        mountedRef.current = true;
        
        return () => {
            mountedRef.current = false;
        };
    }, []);




    const [resendLoading, setResendLoading] = React.useState(false);
    const [needsVerification, setNeedsVerification] = React.useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setNeedsVerification(false);

        try {
            console.log('Initiating Supabase sign in...');
            
            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (authError) {
                if (authError.message.includes('Email not confirmed')) {
                    setNeedsVerification(true);
                    setError('Please confirm your email address before signing in.');
                } else {
                    throw authError;
                }
                return;
            }

            if (!data?.user) {
                setError('Invalid email or password. Please check your credentials and try again.');
                toast.error('Login failed. Please check your credentials.');
                setLoading(false);
                return;
            }

            console.log('Login successful', data.user.id);
            toast.success('Successfully logged in!');
            navigate('/dashboard');

        } catch (err: any) {
            console.error('Login process failed:', err);
            const errMsg = err.message || 'Login failed unexpectedly';
            setError(errMsg);
            toast.error(errMsg);
        } finally {
            setLoading(false);
        }
    };

    const handleResendVerification = async () => {
        if (!email) return;
        setResendLoading(true);
        try {
            const { error } = await supabase.auth.resend({
                type: 'signup',
                email,
                options: {
                    emailRedirectTo: `${window.location.origin}/login`
                }
            });
            if (error) throw error;
            toast.success('Verification link resent! Check your inbox.');
        } catch (err: any) {
            toast.error(err.message || 'Failed to resend link');
        } finally {
            setResendLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (resetLoading || resetSent) return;
        if (!email) {
            toast.error('Please enter your email address first');
            return;
        }
        
        setResetLoading(true);
        
        try {
            const response = await fetch(`${API_URL}/api/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const result = await response.json();
            if (!response.ok) throw new Error(result.error || 'Failed to send reset email');
            
            setResetSent(true);
            toast.success('Password reset email sent. Please check your inbox.');
        } catch (err: any) {
            console.error('Password reset error:', err);
            toast.error(err.message || 'Failed to send reset email. Please try again.');
        } finally {
            setResetLoading(false);
        }
    };



    return (
        <div className="min-h-[100dvh] flex items-center justify-center p-4 relative overflow-hidden bg-[#0a0a0a] w-full max-w-full">
            <div className="absolute top-0 left-1/4 w-full max-w-[800px] h-[500px] bg-primary/10 rounded-full blur-[120px] -z-10" />
            <div className="absolute bottom-0 right-1/4 w-full max-w-[600px] h-[500px] bg-purple-500/5 rounded-full blur-[100px] -z-10" />

            <div className="w-full max-w-md">
                <Link to="/" className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Home
                </Link>

                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold mb-2">Welcome back</h1>
                    <p className="text-gray-400">Enter your credentials to access your workspace</p>

                </div>

                <Card variant="glass" className="p-8">
                    <form id="login-form" name="login" onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg text-sm flex flex-col gap-2">
                                <p>{error}</p>
                                {needsVerification && (
                                    <button
                                        type="button"
                                        onClick={handleResendVerification}
                                        disabled={resendLoading}
                                        className="text-xs text-primary hover:text-primary/80 font-bold underline text-left disabled:opacity-50"
                                    >
                                        {resendLoading ? 'Resending...' : 'Resend Verification Link'}
                                    </button>
                                )}
                                {(error.includes('timeout') || error.includes('Network Error')) && (
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            localStorage.clear();
                                            sessionStorage.clear();
                                            if ('serviceWorker' in navigator) {
                                                const regs = await navigator.serviceWorker.getRegistrations();
                                                for (let r of regs) await r.unregister();
                                            }
                                            window.location.reload();
                                        }}
                                        className="bg-red-500 text-white px-3 py-1 rounded text-xs w-full hover:bg-red-600 transition-colors"
                                    >
                                        Click here to Reset Connection & Reload
                                    </button>
                                )}
                            </div>
                        )}
                        <Input
                            id="email"
                            name="email"
                            icon={Mail}
                            type="email"
                            label="Email Address"
                            placeholder="name@company.com"
                            required
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="email"
                        />

                        <div className="space-y-1">
                            <Input
                                id="password"
                                name="password"
                                icon={Lock}
                                type="password"
                                label="Password"
                                placeholder="••••••••"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                showPasswordToggle
                                autoComplete="current-password"
                            />
                            <div className="flex items-center justify-between py-1">
                                <label className="flex items-center gap-2 cursor-pointer group">
                                    <div className="relative flex items-center">
                                        <input
                                            type="checkbox"
                                            name="remember"
                                            checked={rememberMe}
                                            onChange={(e) => setRememberMe(e.target.checked)}
                                            className="sr-only"
                                        />
                                        <div className={`w-4 h-4 rounded border transition-all ${rememberMe ? 'bg-primary border-primary' : 'border-white/20 bg-white/5'}`}>
                                            {rememberMe && (
                                                <svg className="w-3 h-3 text-white mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                </svg>
                                            )}
                                        </div>
                                    </div>
                                    <span className="text-xs text-gray-400 group-hover:text-gray-300 transition-colors">Remember me</span>
                                </label>
                                <button
                                    type="button"
                                    onClick={handleResetPassword}
                                    disabled={resetLoading || resetSent}
                                    className="text-xs text-primary hover:text-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {resetLoading ? 'Sending...' : resetSent ? '✓ Email sent' : 'Forgot password?'}
                                </button>
                            </div>
                        </div>

                        <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                            <p className="text-[10px] text-gray-400 leading-relaxed italic">
                                💡 <span className="text-primary/80 font-medium">Notice:</span> You can save your password in your browser or keychain during sign in for faster access next time.
                            </p>
                        </div>

                        <Button type="submit" fullWidth loading={loading}>
                            Sign In
                        </Button>


                    </form>
                </Card>

                <p className="text-center mt-6 text-gray-400">
                    Don't have an account?{' '}
                    <Link to="/signup" className="text-primary hover:text-primary/80 font-medium transition-colors">
                        Sign up
                    </Link>
                </p>
            </div>
        </div>
    );
};
