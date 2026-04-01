import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Eye, Database, Activity, Lock } from 'lucide-react';
import { Card } from '../components/common/Card';

export const PrivacyPage = () => {
    const navigate = useNavigate();

    return (
        <div className="min-h-[100dvh] bg-[#0a0a0a] p-4 md:p-8 relative overflow-hidden w-full max-w-full">
            {/* Background gradients */}
            <div className="absolute top-0 right-1/4 w-full max-w-[1000px] h-[600px] bg-primary/10 rounded-full blur-[120px] -z-10" />
            <div className="absolute bottom-0 left-1/4 w-full max-w-[800px] h-[600px] bg-purple-500/5 rounded-full blur-[100px] -z-10" />

            <div className="max-w-4xl mx-auto">
                <button
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back
                </button>

                <Card variant="glass" className="p-8 md:p-12 overflow-hidden">
                    <div className="flex flex-col mb-10">
                        <div className="flex items-center gap-4 mb-2">
                            <div className="p-3 bg-primary/10 rounded-xl border border-primary/20">
                                <Shield className="w-8 h-8 text-primary" />
                            </div>
                            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">Privacy Policy</h1>
                        </div>
                        <p className="text-xl text-primary/80 font-medium ml-[68px]">Aghogho Plyboard Enterprise</p>
                    </div>

                    <div className="space-y-12 text-gray-300">
                        <section className="relative">
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-3">
                                <Eye className="w-6 h-6 text-primary" />
                                Our Commitment
                            </h2>
                            <p className="leading-relaxed text-lg ml-9">
                                We value your privacy and are committed to protecting your personal information.
                            </p>
                        </section>

                        <section className="relative">
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-3">
                                <Database className="w-6 h-6 text-primary" />
                                Information We Collect
                            </h2>
                            <p className="leading-relaxed text-lg ml-9">
                                We may collect basic information such as your name, email address, and payment details when you interact with our business.
                            </p>
                        </section>

                        <section className="relative">
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-3">
                                <Activity className="w-6 h-6 text-primary" />
                                How Information Is Used
                            </h2>
                            <div className="ml-9">
                                <p className="mb-5 text-lg">This information is used solely for the following purposes:</p>
                                <ul className="list-none space-y-3">
                                    <li className="flex items-center gap-4 bg-white/[0.03] p-4 rounded-xl border border-white/5 transition-all hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg hover:shadow-primary/5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_rgba(168,85,247,0.8)] ring-4 ring-primary/20"></div>
                                        <span className="text-lg font-medium">Processing transactions</span>
                                    </li>
                                    <li className="flex items-center gap-4 bg-white/[0.03] p-4 rounded-xl border border-white/5 transition-all hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg hover:shadow-primary/5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_rgba(168,85,247,0.8)] ring-4 ring-primary/20"></div>
                                        <span className="text-lg font-medium">Providing customer support</span>
                                    </li>
                                    <li className="flex items-center gap-4 bg-white/[0.03] p-4 rounded-xl border border-white/5 transition-all hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg hover:shadow-primary/5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_rgba(168,85,247,0.8)] ring-4 ring-primary/20"></div>
                                        <span className="text-lg font-medium">Improving our services</span>
                                    </li>
                                </ul>
                            </div>
                        </section>

                        <section className="relative">
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-3">
                                <Lock className="w-6 h-6 text-primary" />
                                Data Protection & Sharing
                            </h2>
                            <div className="ml-9 space-y-4">
                                <p className="leading-relaxed text-lg">
                                    We do not sell, trade, or share your personal information with third parties, except where required by law or necessary to provide our services.
                                </p>
                                <p className="leading-relaxed text-lg">
                                    We take reasonable steps to ensure your information is secure and protected.
                                </p>
                            </div>
                        </section>

                        <div className="mt-12 pt-8 border-t border-white/5 bg-gradient-to-b from-transparent to-white/[0.02] -mx-8 -mb-8 px-8 pb-8 md:-mx-12 md:-mb-12 md:px-12 md:pb-12">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 pt-2">
                                <div className="space-y-1">
                                    <p className="text-sm text-gray-400 font-medium uppercase tracking-wider">Contact Us</p>
                                    <p className="text-gray-300">If you have any questions, please contact us at:</p>
                                    <a href="mailto:admin@notestandard.com" className="inline-block text-xl text-primary hover:text-white font-semibold transition-colors mt-1">
                                        admin@notestandard.com
                                    </a>
                                </div>
                                <div className="text-left sm:text-right space-y-1">
                                    <p className="text-sm text-gray-400 font-medium uppercase tracking-wider">Last Updated</p>
                                    <p className="text-white text-lg font-medium">01 April 2026</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};
