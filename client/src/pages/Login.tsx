import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, ArrowLeft, Github } from 'lucide-react';
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
    const [connectionStatus, setConnectionStatus] = React.useState<'checking' | 'connected' | 'error'>('checking');
    const [connectionDetails, setConnectionDetails] = React.useState<string>('');
    const [resetLoading, setResetLoading] = React.useState(false);
    const [resetSent, setResetSent] = React.useState(false);

    // Ref to track if component is mounted (for StrictMode cleanup)
    const mountedRef = React.useRef(true);
    const checkInProgressRef = React.useRef(false);

    React.useEffect(() => {
        mountedRef.current = true;
        checkConnectivity();
        
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const checkConnectivity = async () => {
        // Prevent duplicate checks from StrictMode double-invocation
        if (checkInProgressRef.current) {
            console.log('[Health Check] Already in progress, skipping...');
            return;
        }
        checkInProgressRef.current = true;

        const results = {
            supabase: false,
            backend: false,
            external: false,
            details: [] as string[]
        };

        // Helper to create a fetch with individual timeout
        const fetchWithTimeout = async (
            url: string, 
            options: RequestInit = {}, 
            timeoutMs = 5000
        ): Promise<Response> => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => {
                controller.abort(new DOMException('Request timeout', 'TimeoutError'));
            }, timeoutMs);
            
            try {
                const response = await fetch(url, { ...options, signal: controller.signal });
                clearTimeout(timeoutId);
                return response;
            } catch (err) {
                clearTimeout(timeoutId);
                throw err;
            }
        };

        console.log('[Health Check] Starting connectivity tests...');

        // Run all checks in parallel using Promise.allSettled
        const [externalResult, supabaseResult, backendResult] = await Promise.allSettled([
            // External Internet check
            (async () => {
                try {
                    const res = await fetchWithTimeout('https://api.github.com/zen', {}, 5000);
                    return res.ok ? 'ok' : 'failed';
                } catch (e: any) {
                    console.warn('[Health Check] External Internet:', e.name);
                    return 'error';
                }
            })(),
            // Supabase check
            (async () => {
                try {
                    const start = Date.now();
                    const res = await fetchWithTimeout(
                        `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`,
                        { headers: { 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY } },
                        5000
                    );
                    const duration = Date.now() - start;
                    // 401 is ok - means Supabase responded
                    return (res.ok || res.status === 401) ? `${duration}ms` : 'failed';
                } catch (e: any) {
                    console.warn('[Health Check] Supabase:', e.name);
                    return 'error';
                }
            })(),
            // Backend check
            (async () => {
                try {
                    const backendRoot = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace(/\/api$/, '');
                    const start = Date.now();
                    const res = await fetchWithTimeout(`${backendRoot}/`, {}, 5000);
                    const duration = Date.now() - start;
                    return res.ok ? `${duration}ms` : 'failed';
                } catch (e: any) {
                    console.warn('[Health Check] Backend:', e.name);
                    return 'error';
                }
            })()
        ]);

        // Don't update state if component unmounted
        if (!mountedRef.current) {
            console.log('[Health Check] Component unmounted, skipping state update');
            checkInProgressRef.current = false;
            return;
        }

        // Process results
        if (externalResult.status === 'fulfilled' && externalResult.value === 'ok') {
            results.external = true;
            results.details.push('Internet: OK');
        } else {
            results.details.push('Internet: No Access');
        }

        if (supabaseResult.status === 'fulfilled' && supabaseResult.value !== 'error' && supabaseResult.value !== 'failed') {
            results.supabase = true;
            results.details.push(`Supabase: ${supabaseResult.value}`);
        } else {
            results.details.push('Supabase: Blocked');
        }

        if (backendResult.status === 'fulfilled' && backendResult.value !== 'error' && backendResult.value !== 'failed') {
            results.backend = true;
            results.details.push(`API: ${backendResult.value}`);
        } else {
            results.details.push('API: Offline');
        }

        console.log('[Health Check] Results:', results);

        setConnectionDetails(results.details.join(' | '));

        if (results.supabase && results.backend) {
            setConnectionStatus('connected');
        } else {
            setConnectionStatus('error');
        }

        checkInProgressRef.current = false;
    };


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

    const handleGoogleLogin = async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/dashboard`,
                },
            });
            if (error) throw error;
        } catch (err: any) {
            toast.error(err.message || 'Failed to sign in with Google');
        }
    };

    const handleGitHubLogin = async () => {
        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'github',
                options: {
                    redirectTo: `${window.location.origin}/dashboard`,
                },
            });
            if (error) throw error;
        } catch (err: any) {
            toast.error(err.message || 'Failed to sign in with GitHub');
        }
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
                    <div className="mt-2 text-xs space-y-1">
                        {connectionStatus === 'checking' && <span className="text-yellow-500">Connecting to server...</span>}
                        {connectionStatus === 'connected' && <span className="text-green-500">● Server Online ({connectionDetails})</span>}
                        {connectionStatus === 'error' && <span className="text-red-500">● Connection Failed: {connectionDetails}</span>}
                        <div className="text-gray-500 opacity-50">
                            API: {import.meta.env.VITE_API_URL || 'http://localhost:5000'}<br />
                            DB: {import.meta.env.VITE_SUPABASE_URL}
                        </div>
                        <button
                            type="button"
                            onClick={async () => {
                                localStorage.clear();
                                sessionStorage.clear();
                                const regs = await navigator.serviceWorker.getRegistrations();
                                for (let r of regs) await r.unregister();
                                window.location.reload();
                            }}
                            className="text-primary hover:underline block mt-2"
                        >
                            Force Reset Cache & Service Workers
                        </button>
                    </div>
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

                        <div className="relative my-6">
                            <div className="absolute inset-0 flex items-center">
                                <div className="w-full border-t border-white/10"></div>
                            </div>
                            <div className="relative flex justify-center text-xs">
                                <span className="bg-[#0a0a0a] px-2 text-gray-500">Or continue with</span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <Button type="button" variant="secondary" fullWidth onClick={handleGoogleLogin}>
                                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                                    <path
                                        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                                        fill="#4285F4"
                                    />
                                    <path
                                        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                                        fill="#34A853"
                                    />
                                    <path
                                        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                                        fill="#FBBC05"
                                    />
                                    <path
                                        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                                        fill="#EA4335"
                                    />
                                </svg>
                                Google
                            </Button>
                            <Button type="button" variant="secondary" fullWidth onClick={handleGitHubLogin}>
                                <Github className="w-5 h-5 mr-2" />
                                GitHub
                            </Button>
                        </div>
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
