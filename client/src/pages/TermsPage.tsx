import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card } from '../components/common/Card';

export const TermsPage = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-8">
            {/* Background gradients */}
            <div className="absolute top-0 right-1/4 w-[1000px] h-[600px] bg-primary/10 rounded-full blur-[120px] -z-10" />
            <div className="absolute bottom-0 left-1/4 w-[800px] h-[600px] bg-purple-500/5 rounded-full blur-[100px] -z-10" />

            <div className="max-w-4xl mx-auto">
                <button
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </button>

                <Card variant="glass" className="p-8 md:p-12">
                    <h1 className="text-4xl font-bold mb-8">Terms & Conditions</h1>

                    <div className="space-y-8 text-gray-300">
                        <div>
                            <p className="leading-relaxed mb-6">
                                By signing up for Note Standard, you agree to the following terms and conditions:
                            </p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">Community Guidelines</h2>
                            <ul className="list-disc list-inside space-y-2 ml-4">
                                <li>No abusive, offensive, or harmful language/behavior is allowed.</li>
                                <li>Violations may result in suspension or banning.</li>
                            </ul>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">Data Usage Consent</h2>
                            <ul className="list-disc list-inside space-y-2 ml-4">
                                <li>Your anonymized, aggregated data may be used to improve services and generate revenue (e.g., ads, analytics).</li>
                                <li>Personal data (email, name) will NOT be sold but may be used for targeted features.</li>
                            </ul>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">Account Responsibilities</h2>
                            <ul className="list-disc list-inside space-y-2 ml-4">
                                <li>Secure your login credentials; you're accountable for account activity.</li>
                                <li>You are responsible for all activities that occur under your account.</li>
                                <li>Notify us immediately of any unauthorized use of your account.</li>
                            </ul>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">Termination Rights</h2>
                            <ul className="list-disc list-inside space-y-2 ml-4">
                                <li>We reserve the right to remove accounts violating these terms.</li>
                                <li>You may terminate your account at any time through the settings page.</li>
                            </ul>
                        </div>

                        <div className="mt-8 p-6 bg-primary/10 border border-primary/20 rounded-lg">
                            <h3 className="text-lg font-semibold text-white mb-3">Agreement</h3>
                            <p className="text-sm leading-relaxed">
                                By creating an account with Note Standard, you acknowledge that you have read,
                                understood, and agree to be bound by these Terms & Conditions and our Privacy Policy.
                                If you do not agree to these terms, please do not use our services.
                            </p>
                        </div>

                        <div className="pt-6 border-t border-white/10">
                            <p className="text-sm text-gray-400">
                                Last updated: January 14, 2026
                            </p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};
