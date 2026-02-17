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
                                Welcome to <strong>Note Standard</strong>. We believe in a new internet model where user privacy and 
                                sustainable monetization coexist. By signing up for our services, you agree to the following terms and conditions:
                            </p>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">1. Our Core Principles</h2>
                            <div className="grid md:grid-cols-2 gap-6 mb-8">
                                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                                    <h4 className="text-primary font-bold mb-2">Transparency</h4>
                                    <p className="text-sm">We treat user data as a liability to be protected, not an asset to be exploited. Users must know exactly how their data is used.</p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                                    <h4 className="text-primary font-bold mb-2">Control</h4>
                                    <p className="text-sm">Users have granular control (opt-in/opt-out) over monetization features through the Privacy Dashboard.</p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">2. Community Guidelines</h2>
                            <ul className="list-disc list-inside space-y-2 ml-4">
                                <li>No abusive, offensive, or harmful language/behavior is allowed.</li>
                                <li>Violations may result in immediate suspension or permanent banning.</li>
                                <li>Users are responsible for all content they create or share.</li>
                            </ul>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">3. Data Usage & Privacy</h2>
                            <ul className="list-disc list-inside space-y-2 ml-4">
                                <li><strong>Anonymized Analytics</strong>: We process non-identifiable usage data to improve our services. Consent can be revoked in settings.</li>
                                <li><strong>Contextual Advertising</strong>: We may show ads based on session tags. We do NOT use behavioral tracking or track users across sites.</li>
                                <li><strong>Affiliate Partnerships</strong>: We suggest tools that integrate with our app. Exporting data to these tools is user-initiated.</li>
                            </ul>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">4. Financial & Wallet Services</h2>
                            <ul className="list-disc list-inside space-y-2 ml-4">
                                <li><strong>Custodianship</strong>: We provide managed wallet services. Users enjoy secure internal transfers and multi-currency support.</li>
                                <li><strong>Transaction Fees</strong>: Fees and spreads apply to withdrawals, swaps, and certain external transfers as shown in the UI.</li>
                                <li><strong>Finality</strong>: Digital asset transfers are final and non-refundable once processed on the ledger.</li>
                            </ul>
                        </div>

                        <div>
                            <h2 className="text-2xl font-semibold text-white mb-4">5. Affiliate Program</h2>
                            <ul className="list-disc list-inside space-y-2 ml-4">
                                <li>Commission rates are set by admin settings (standard 10% of revenue generated).</li>
                                <li>Earnings are credited instantly to your internal system wallet.</li>
                            </ul>
                        </div>

                        <div className="mt-8 p-6 bg-primary/10 border border-primary/20 rounded-lg">
                            <h3 className="text-lg font-semibold text-white mb-3">Agreement</h3>
                            <p className="text-sm leading-relaxed">
                                By creating an account with Note Standard, you acknowledge that you have read,
                                understood, and agree to be bound by these Terms & Conditions.
                                If you do not agree to these terms, please do not use our services.
                            </p>
                        </div>

                        <div className="pt-6 border-t border-white/10">
                            <p className="text-sm text-gray-400">
                                Last updated: February 14, 2026
                            </p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};
