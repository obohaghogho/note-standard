import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowLeft } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Card } from '../components/common/Card';
import { supabase } from '../lib/supabase';
import { supabaseSafe } from '../lib/supabaseSafe';
import { toast } from 'react-hot-toast';

export const Login = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = React.useState(false);
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [error, setError] = React.useState('');
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




    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            console.log('Initiating Supabase sign in...');
            
            // Use safeAuth wrapper which handles 429s and toasts
            const data = await supabaseSafe<any>(
                'auth-login',
                async () => supabase.auth.signInWithPassword({
                    email,
                    password,
                })
            );

            if (!(data as any)?.user) {
                setLoading(false);
                return;
            }

            const { user } = data as any;
            console.log('Login successful', user.id);

            // Fetch profile is now handled centrally by AuthContext.
            // We just wait for the navigation and let AuthContext sync.
            // Note: We don't wait for profile sync here because AuthContext handles 
            // the protected route protection and data loading.
            navigate('/dashboard');

        } catch (err: any) {
            console.error('Login process failed:', err);
            // safeAuth catches most, but if something else throws:
            toast.error('Login failed unexpectedly');
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async () => {
        if (resetLoading || resetSent) return;
        if (!email) {
            toast.error('Please enter your email address first');
            return;
        }
        
        setResetLoading(true);
        
        // Use safeAuth wrapper
        const res = await supabaseSafe(
            'reset-password',
            async () => supabase.auth.resetPasswordForEmail(email, {
                redirectTo: `${window.location.origin}/reset-password`,
            })
        );

        // If safeAuth returned null, it failed (and toasted). 
        // If it returned empty object {}, it succeeded.
        if (res) {
            setResetSent(true);
            toast.success('Password reset email sent. Please check your inbox.');
        } 
        
        setResetLoading(false);
    };



    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background gradients */}
            <div className="absolute top-0 left-1/4 w-[1000px] h-[600px] bg-primary/10 rounded-full blur-[120px] -z-10" />
            <div className="absolute bottom-0 right-1/4 w-[800px] h-[600px] bg-purple-500/5 rounded-full blur-[100px] -z-10" />

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
                    <form onSubmit={handleSubmit} className="space-y-6">
                        {error && (
                            <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-lg text-sm flex flex-col gap-2">
                                <p>{error}</p>
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
                            <div className="flex justify-end">
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
