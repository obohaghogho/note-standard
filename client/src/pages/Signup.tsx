import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, ArrowLeft, Phone } from 'lucide-react';
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
    const [loadingStatus, setLoadingStatus] = React.useState('');
    const [fullName, setFullName] = React.useState(''); // Not currently used by backend/schema but good to have
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [phone, setPhone] = React.useState('');
    const [otp, setOtp] = React.useState('');
    const [emailOtp, setEmailOtp] = React.useState('');
    const [step, setStep] = React.useState<'details' | 'verify'>('details');
    const [error, setError] = React.useState('');
    const [termsAccepted, setTermsAccepted] = React.useState(false);
    const [showTermsModal, setShowTermsModal] = React.useState(false);

    React.useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const ref = urlParams.get('ref');
        if (ref) {
            localStorage.setItem('referrer_id', ref);
        }
    }, []);

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

                // 0. Get Referral ID from URL or Storage
                const urlParams = new URLSearchParams(window.location.search);
                const referrerId = urlParams.get('ref') || localStorage.getItem('referrer_id');

                // 1. Create Account with safeAuth
                setLoading(true);
                setLoadingStatus('Creating account...');
                setError('');
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
                                referrer_id: referrerId
                            },
                        },
                    }),
                    { minDelay: 100 } // Fast track auth
                );

                if (!signUpData?.user) {
                    if (!error) {
                        setError('Failed to create account. Email may already be registered.');
                        toast.error('Signup failed. Please try a different email.');
                    }
                    setLoading(false);
                    return;
                }

                // 2. Add Phone Number (triggers OTP)
                setLoadingStatus('Sending verification code...');
                const updateData = await supabaseSafe<any>(
                    'signup-phone',
                    async () => supabase.auth.updateUser({
                        phone: phone
                    }),
                    { minDelay: 100 } // Fast track auth
                );

                if (!updateData) {
                    setError('Failed to send verification code. Please check your phone number.');
                    toast.error('Could not send OTP.');
                    setLoading(false);
                    return;
                }

                setStep('verify');
                toast.success('Verification codes sent to your phone and email!');

            } else {
                // 3. Verify Email OTP
                setLoading(true);
                setLoadingStatus('Verifying email code...');
                const verifyEmailData = await supabaseSafe<any>(
                    'signup-verify-email',
                    async () => supabase.auth.verifyOtp({
                        email,
                        token: emailOtp,
                        type: 'signup'
                    }),
                    { minDelay: 100 }
                );

                if (!verifyEmailData?.user) {
                    setError('Invalid email verification code.');
                    toast.error('Email verification failed.');
                    setLoading(false);
                    return;
                }

                // 4. Verify Phone OTP
                setLoadingStatus('Verifying phone code...');
                const verifyPhoneData = await supabaseSafe<any>(
                    'signup-verify-phone',
                    async () => supabase.auth.verifyOtp({
                        phone,
                        token: otp,
                        type: 'phone_change'
                    }),
                    { minDelay: 100 }
                );

                if (!verifyPhoneData?.user) {
                    setError('Invalid phone verification code.');
                    toast.error('Phone verification failed.');
                    setLoading(false);
                    return;
                }

                toast.success('Account verified successfully!');
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



    return (
        <div className="min-h-[100dvh] flex items-center justify-center p-4 relative overflow-hidden">
            {/* Background gradients */}
            <div className="absolute top-0 right-1/4 w-full max-w-[800px] h-[500px] bg-primary/10 rounded-full blur-[120px] -z-10 allow-overflow" />
            <div className="absolute bottom-0 left-1/4 w-full max-w-[600px] h-[500px] bg-purple-500/5 rounded-full blur-[100px] -z-10 allow-overflow" />

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
                                id="emailOtp"
                                name="emailOtp"
                                type="text"
                                label="Email Verification Code"
                                placeholder="123456"
                                required
                                value={emailOtp}
                                onChange={(e) => setEmailOtp(e.target.value)}
                                className="text-center letter-spacing-2 text-xl"
                                autoComplete="one-time-code"
                            />

                            <Input
                                id="otp"
                                name="otp"
                                type="text"
                                label="Phone Verification Code"
                                placeholder="123456"
                                required
                                value={otp}
                                onChange={(e) => setOtp(e.target.value)}
                                className="text-center letter-spacing-2 text-xl"
                                autoComplete="one-time-code"
                            />

                            <Button 
                                type="submit" 
                                fullWidth 
                                loading={loading}
                                loadingText={loadingStatus}
                            >
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
                                    {' '}and{' '}
                                    <Link 
                                        to="/privacy" 
                                        className="text-primary hover:text-primary/80 underline transition-colors"
                                    >
                                        Privacy Policy
                                    </Link>
                                </label>
                            </div>

                            <div className="bg-primary/5 rounded-lg p-3 border border-primary/10">
                                <p className="text-[10px] text-gray-400 leading-relaxed italic">
                                    💡 <span className="text-primary/80 font-medium">Notice:</span> You can save your password in your browser or keychain during sign in for faster access next time.
                                </p>
                            </div>

                            <Button 
                                type="submit" 
                                fullWidth 
                                loading={loading}
                                loadingText={loadingStatus}
                            >
                                Send Verification Code
                            </Button>


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
