import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, ArrowLeft, Phone, Github } from 'lucide-react';
import { Button } from '../components/common/Button';
import { Input } from '../components/common/Input';
import { Card } from '../components/common/Card';
import { TermsModal } from '../components/auth/TermsModal';
import { supabase } from '../lib/supabase';
import { supabaseSafe } from '../lib/supabaseSafe';
import { toast } from 'react-hot-toast';

export const Signup = () => {
    const navigate = useNavigate();
    const [loading, setLoading] = React.useState(false);
    const [fullName, setFullName] = React.useState(''); // Not currently used by backend/schema but good to have
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [phone, setPhone] = React.useState('');
    const [otp, setOtp] = React.useState('');
    const [step, setStep] = React.useState<'details' | 'verify'>('details');
    const [error, setError] = React.useState('');
    const [termsAccepted, setTermsAccepted] = React.useState(false);
    const [showTermsModal, setShowTermsModal] = React.useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (step === 'details') {
                // Validate terms acceptance
                if (!termsAccepted) {
                    setError('You must accept the Terms & Conditions to continue');
                    setLoading(false);
                    return;
                }

                // 1. Create Account with safeAuth
                const signUpData = await supabaseSafe<any>(
                    'signup-create',
                    async () => supabase.auth.signUp({
                        email,
                        password,
                        options: {
                            data: {
                                full_name: fullName,
                                terms_accepted: true,
                                terms_accepted_at: new Date().toISOString(),
                            },
                        },
                    })
                );

                if (!(signUpData as any)?.user) return; // safeAuth toasted

                // 2. Add Phone Number (triggers OTP)
                const updateData = await supabaseSafe<any>(
                    'signup-phone',
                    async () => supabase.auth.updateUser({
                        phone: phone
                    })
                );

                if (!updateData) return; // safeAuth toasted

                setStep('verify');
                toast.success('Verification code sent to your phone!');

            } else {
                // 3. Verify OTP
                const verifyData = await supabaseSafe<any>(
                    'signup-verify',
                    async () => supabase.auth.verifyOtp({
                        phone,
                        token: otp,
                        type: 'phone_change'
                    })
                );

                if (!(verifyData as any)?.user) return; // safeAuth toasted

                toast.success('Phone verified successfully!');
                navigate('/dashboard');
            }
        } catch (err: any) {
            console.error(err);
            setError(err.message);
            // If phone invalid, stay on details?
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignup = async () => {
        if (!termsAccepted) {
            setError('You must accept the Terms & Conditions to continue');
            toast.error('Please accept the Terms & Conditions');
            return;
        }

        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: `${window.location.origin}/dashboard`,
                    queryParams: {
                        terms_accepted: 'true',
                    },
                },
            });
            if (error) throw error;
        } catch (err: any) {
            toast.error(err.message || 'Failed to sign up with Google');
        }
    };

    const handleGitHubSignup = async () => {
        if (!termsAccepted) {
            setError('You must accept the Terms & Conditions to continue');
            toast.error('Please accept the Terms & Conditions');
            return;
        }

        try {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'github',
                options: {
                    redirectTo: `${window.location.origin}/dashboard`,
                    queryParams: {
                        terms_accepted: 'true',
                    },
                },
            });
            if (error) throw error;
        } catch (err: any) {
            toast.error(err.message || 'Failed to sign up with GitHub');
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background gradients */}
            <div className="absolute top-0 right-1/4 w-[1000px] h-[600px] bg-primary/10 rounded-full blur-[120px] -z-10" />
            <div className="absolute bottom-0 left-1/4 w-[800px] h-[600px] bg-purple-500/5 rounded-full blur-[100px] -z-10" />

            <div className="w-full max-w-md">
                <Link to="/" className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors">
                    <ArrowLeft className="w-4 h-4" />
                    Back to Home
                </Link>

                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold mb-2">Create an account</h1>
                    <p className="text-gray-400">Join thousands of teams using Note Standard</p>
                </div>

                <Card variant="glass" className="p-8">
                    {step === 'verify' ? (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div className="text-center mb-6">
                                <h2 className="text-xl font-semibold mb-2">Verify Phone</h2>
                                <p className="text-sm text-gray-400">Enter the code sent to {phone}</p>
                            </div>

                            {error && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-2 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}

                            <Input
                                id="otp"
                                name="otp"
                                type="text"
                                label="Verification Code"
                                placeholder="123456"
                                required
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                className="text-center letter-spacing-2 text-xl"
                                autoComplete="one-time-code"
                            />

                            <Button type="submit" fullWidth loading={loading}>
                                Verify & Access App
                            </Button>

                            <button
                                type="button"
                                onClick={() => setStep('details')}
                                className="w-full text-sm text-gray-500 hover:text-white mt-4"
                            >
                                Back to details
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-6">
                            {error && (
                                <div className="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-2 rounded-lg text-sm">
                                    {error}
                                </div>
                            )}
                            <Input
                                id="fullName"
                                name="fullName"
                                icon={User}
                                type="text"
                                label="Full Name"
                                placeholder="John Doe"
                                required
                                value={fullName}
                                onChange={(e) => setFullName(e.target.value)}
                                autoComplete="name"
                            />

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

                            <Input
                                id="password"
                                name="password"
                                icon={Lock}
                                type="password"
                                label="Password"
                                placeholder="Create a password"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                showPasswordToggle
                                autoComplete="new-password"
                            />

                            <Input
                                id="phone"
                                name="phone"
                                icon={Phone}
                                type="tel"
                                label="Phone Number"
                                placeholder="+1234567890"
                                required
                                value={phone}
                                onChange={(e) => setPhone(e.target.value)}
                                autoComplete="tel"
                            />

                            {/* Terms & Conditions Checkbox */}
                            <div className="flex items-start gap-3">
                                <input
                                    type="checkbox"
                                    id="terms"
                                    name="terms"
                                    checked={termsAccepted}
                                    onChange={(e) => setTermsAccepted(e.target.checked)}
                                    className="mt-1 w-4 h-4 rounded border-white/20 bg-white/5 text-primary focus:ring-primary focus:ring-offset-0 cursor-pointer"
                                />
                                <label htmlFor="terms" className="text-sm text-gray-400 cursor-pointer">
                                    I agree to the{' '}
                                    <button
                                        type="button"
                                        onClick={() => setShowTermsModal(true)}
                                        className="text-primary hover:text-primary/80 underline transition-colors"
                                    >
                                        Terms & Conditions
                                    </button>
                                    {' '}and Privacy Policy
                                </label>
                            </div>

                            <Button type="submit" fullWidth loading={loading}>
                                Send Verification Code
                            </Button>

                            <div className="relative my-6">
                                <div className="absolute inset-0 flex items-center">
                                    <div className="w-full border-t border-white/10"></div>
                                </div>
                                <div className="relative flex justify-center text-xs">
                                    <span className="bg-[#0a0a0a] px-2 text-gray-500">Or continue with</span>
                                </div>
                            </div>

                            {/* Social Buttons */}
                            <div className="grid grid-cols-2 gap-4">
                                <Button type="button" variant="secondary" fullWidth onClick={handleGoogleSignup}>
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
                                <Button type="button" variant="secondary" fullWidth onClick={handleGitHubSignup}>
                                    <Github className="w-5 h-5 mr-2" />
                                    GitHub
                                </Button>
                            </div>
                        </form>
                    )}
                </Card>

                {/* Terms Modal */}
                <TermsModal
                    isOpen={showTermsModal}
                    onClose={() => setShowTermsModal(false)}
                />

                <p className="text-center mt-6 text-gray-400">
                    Already have an account?{' '}
                    <Link to="/login" className="text-primary hover:text-primary/80 font-medium transition-colors">
                        Sign in
                    </Link>
                </p>
            </div>
        </div>
    );
};
