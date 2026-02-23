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
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // Check if we came from an error URL immediately
        const errorCode = searchParams.get('error_code');
        const errorDesc = searchParams.get('error_description');

        if (errorCode) {
            setError(errorDesc || 'Reset link is invalid or expired.');
            return;
        }

        // Listen for the PASSWORD_RECOVERY event which happens when the user clicks the email link
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event) => {
            if (event === 'PASSWORD_RECOVERY') {
                setError(null); // Clear any previous errors, we act verified
            } else if (event === 'SIGNED_IN') {
                 // User is signed in, we can allow password reset
                 setError(null);
            }
        });

        // Also check initial session just in case the event fired before we mounted (rare but possible)
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setError(null); // Valid session exists
            } else {
                 // Check if we have a hash with tokens (implicit flow)
                 const hashParams = new URLSearchParams(window.location.hash.substring(1));
                 const type = hashParams.get('type');
                 const accessToken = hashParams.get('access_token');

                 if (type === 'recovery' && accessToken) {
                     // We have a recovery token! Supabase *should* have handled this, but let's be lenient
                     // because the event listener above will likely catch it.
                     // We just clear error for now and let the timeout verifier run.
                     console.log('Recovery token detected in URL');
                     setError(null);
                 }

                 // Wait a moment for the auth flow to complete (it's async)
                 // If after 4 seconds we still have no session, show error
                 setTimeout(async () => {
                     const { data: { session: retrySession } } = await supabase.auth.getSession();
                     console.log('Session check (delayed):', !!retrySession);
                     if (retrySession) {
                        setError(null);
                     } else {
                        setError('No active session found. Please try requesting a new password reset link.');
                     }
                 }, 4000);
            }
        });

        return () => {
            subscription.unsubscribe();
        };
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
        } catch (err: any) {
            console.error('Update password error:', err);
            setError(err.message);
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
                    {error ? (
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
                        <form onSubmit={handleUpdatePassword} className="space-y-6">
                            <Input
                                id="new-password"
                                name="new-password"
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
