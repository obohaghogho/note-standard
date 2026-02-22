import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Eye, Lock, Database, RefreshCw } from 'lucide-react';
import { Card } from '../components/common/Card';

export const PrivacyPage = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-screen bg-[#0a0a0a] p-4 md:p-8">
            {/* Background gradients */}
            <div className="absolute top-0 right-1/4 w-full max-w-[1000px] h-[600px] bg-primary/10 rounded-full blur-[120px] -z-10 allow-overflow" />
            <div className="absolute bottom-0 left-1/4 w-full max-w-[800px] h-[600px] bg-purple-500/5 rounded-full blur-[100px] -z-10 allow-overflow" />

            <div className="max-w-4xl mx-auto">
                <button
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </button>

                <Card variant="glass" className="p-8 md:p-12">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 bg-primary/10 rounded-xl">
                            <Shield className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="text-4xl font-bold">Privacy Policy</h1>
                    </div>

                    <div className="space-y-10 text-gray-300">
                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Eye className="w-6 h-6 text-primary" />
                                Our Privacy Philosophy
                            </h2>
                            <p className="leading-relaxed">
                                At <strong>Note Standard</strong>, we believe user data is a liability to be protected, not an asset to be exploited. 
                                Our monetization strategy balances revenue generation with uncompromising user privacy. We prioritize user agency, 
                                transparency, and value exchange over traditional surveillance-based models.
                            </p> section
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4">1. Data Collection & Usage</h2>
                            <div className="space-y-4">
                                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                                    <h3 className="text-white font-medium mb-2">A. Contextual Advertising (Not Behavioral)</h3>
                                    <p className="text-sm">
                                        We use <strong>Contextual Targeting</strong>. Instead of tracking you across the web, we serve ads based on the 
                                        <em> content</em> of your current session (e.g., tags like "Coding"). No personal ID or behavioral history is 
                                        ever shared with ad networks.
                                    </p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                                    <h3 className="text-white font-medium mb-2">B. Anonymized Insights</h3>
                                    <p className="text-sm">
                                        We aggregate high-level, non-personal usage patterns (e.g., "Peak focus hours for students") to generate 
                                        productivity reports. This data is count-based and anonymized at the source using differential privacy methods.
                                    </p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                                    <h3 className="text-white font-medium mb-2">C. Financial Data</h3>
                                    <p className="text-sm">
                                        Wallet balances and transaction histories are stored with high-level encryption. We only access this data 
                                        to process your requests (transfers, withdrawals, swaps) and for required anti-fraud monitoring.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <RefreshCw className="w-6 h-6 text-primary" />
                                2. User Control & Opt-Outs
                            </h2>
                            <p className="mb-4">You have granular control over how your data is monetized. In your Dashboard Settings, you can:</p>
                            <ul className="list-disc list-inside space-y-2 ml-4">
                                <li>Enable/Disable <strong>Anonymous Usage Analytics</strong>.</li>
                                <li>Toggle <strong>Contextual Offers</strong> (available for Free plan).</li>
                                <li>Manage <strong>Partner Recommendations</strong>.</li>
                            </ul>
                            <p className="mt-4 text-sm bg-primary/5 p-3 rounded border border-primary/10">
                                <strong>Pro Users:</strong> Upgrading to a Pro plan automatically disables all third-party contextual ads and 
                                grants access to private-only modes.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Lock className="w-6 h-6 text-primary" />
                                3. Your Rights
                            </h2>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="flex gap-3">
                                    <Database className="w-5 h-5 text-primary shrink-0" />
                                    <div>
                                        <h4 className="text-white font-medium">Data Portability</h4>
                                        <p className="text-sm">Download a complete copy of your notes and profile in JSON format at any time.</p>
                                    </div>
                                </div>
                                <div className="flex gap-3">
                                    <Shield className="w-5 h-5 text-primary shrink-0" />
                                    <div>
                                        <h4 className="text-white font-medium">Right to Erasure</h4>
                                        <p className="text-sm">Use the "Forget Me" button to permanently scrub all your data from our servers.</p>
                                    </div>
                                </div>
                            </div>
                        </section>

                        <div className="pt-8 border-t border-white/10">
                            <p className="text-sm text-gray-500">
                                Last updated: February 14, 2026<br />
                                For inquiries: privacy@notestandard.com
                            </p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};
