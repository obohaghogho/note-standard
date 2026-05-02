import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Card } from '../components/common/Card';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Lock, ArrowLeft, RotateCw } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const ResetPassword = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [isInitializing, setIsInitializing] = useState(true);

    useEffect(() => {
        let mounted = true;

        // 1. Check if we came from an error URL immediately
        const errorCode = searchParams.get('error_code');
        const errorDesc = searchParams.get('error_description');

        if (errorCode) {
            setError(errorDesc || 'Reset link is invalid or expired.');
            setIsInitializing(false);
            return;
        }

        // 2. Setup Auth Listener (Crucial for detecting recovery event)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
            console.log(`[ResetPassword] Auth event: ${event}`);
            if (!mounted) return;

            if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
                setError(null);
                setIsInitializing(false);
                if (session?.user?.email) {
                    setEmail(session.user.email);
                }
            }
        });

        // 3. Proactive check for session or hash tokens
        const checkSession = async () => {
            try {
                // First check immediate session
                const { data: { session: existingSession } } = await supabase.auth.getSession();
                if (!mounted) return;
 
                if (existingSession) {
                    console.log('[ResetPassword] Session found');
                    setError(null);
                    setIsInitializing(false);
                    if (existingSession.user?.email) {
                        setEmail(existingSession.user.email);
                    }
                    return;
                }

                // If no session, check for recovery tokens (hash or query)
                const hash = window.location.hash;
                const code = searchParams.get('code');
                const hasTokens = (hash && (hash.includes('type=recovery') || hash.includes('access_token='))) || code;

                if (hasTokens) {
                    console.log('[ResetPassword] Recovery tokens detected, waiting for session activation...');
                    // If we have a 'code', Supabase handles it automatically since detectSessionInUrl is now true
                    setTimeout(() => {
                        if (mounted && isInitializing) {
                            setIsInitializing(false);
                            setError('Reset process timed out. Please try requesting a new link.');
                        }
                    }, 10000);
                } else {
                    // No session and no tokens?
                    // Final attempt: wait 1 second just in case of race condition in detection
                    await new Promise(r => setTimeout(r, 1000));
                    if (!mounted) return;
                    
                    const { data: { session: retrySession } } = await supabase.auth.getSession();
                    if (retrySession) {
                        setError(null);
                        setIsInitializing(false);
                        setEmail(retrySession.user?.email || '');
                        return;
                    }

                    setIsInitializing(false);
                    setError('No active session found. This link may have expired or was already used.');
                }
            } catch (err) {
                if (!mounted) return;
                console.error('[ResetPassword] Error:', err);
                setIsInitializing(false);
                setError('Failed to initialize reset flow.');
            }
        };

        checkSession();

        return () => {
            mounted = false;
            subscription.unsubscribe();
        };
        // isInitializing is used in a timeout closure but adding it as a dependency 
        // would cause the initialization logic to re-run unnecessarily.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchParams]);

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const { data, error: updateError } = await supabase.auth.updateUser({
                password: password
            });

            if (updateError) throw updateError;
            if (!data.user) throw new Error('Update failed user check');

            toast.success('Password updated successfully!');
            navigate('/login');
        } catch (err: unknown) {
            console.error('Update password error:', err);
            setError(err instanceof Error ? err.message : 'Failed to update password');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-[100dvh] flex items-center justify-center p-4 relative overflow-hidden bg-[#0a0a0a] w-full max-w-full">
             {/* Background gradients */}
             <div className="absolute top-0 left-1/4 w-full max-w-[1000px] h-[600px] bg-primary/10 rounded-full blur-[120px] -z-10" />
             <div className="absolute bottom-0 right-1/4 w-full max-w-[800px] h-[600px] bg-purple-500/5 rounded-full blur-[100px] -z-10" />

            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold mb-2 text-white">Reset Password</h1>
                    <p className="text-gray-400">Set a new secure password for your account</p>
                </div>

                <Card variant="glass" className="p-8">
                    {isInitializing ? (
                        <div className="flex flex-col items-center justify-center py-8 gap-4 text-gray-400">
                             <RotateCw className="w-8 h-8 animate-spin text-primary" />
                             <p className="text-sm font-medium animate-pulse">Checking your recovery link...</p>
                        </div>
                    ) : error ? (
                        <div className="text-center space-y-4">
                            <div className="text-red-500 bg-red-500/10 p-4 rounded-lg border border-red-500/20">
                                <p className="font-medium">Error</p>
                                <p className="text-sm mt-1">{error}</p>
                            </div>
                            <Button onClick={() => navigate('/login')} variant="secondary" fullWidth>
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Login
                            </Button>
                        </div>
                    ) : (
                        <form id="reset-password-form" name="reset-password" onSubmit={handleUpdatePassword} className="space-y-6">
                            {/* Hidden email field for password manager context */}
                            <input 
                                id="reset-password-email-hidden"
                                type="hidden" 
                                name="email" 
                                value={email} 
                                autoComplete="username email" 
                            />

                            <Input
                                id="password"
                                name="password"
                                icon={Lock}
                                type="password"
                                label="New Password"
                                placeholder="Min. 6 characters"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                showPasswordToggle
                                minLength={6}
                                autoComplete="new-password"
                            />

                            <Button type="submit" fullWidth loading={loading}>
                                <RotateCw className="w-4 h-4 mr-2" />
                                Update Password
                            </Button>
                        </form>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default ResetPassword;
