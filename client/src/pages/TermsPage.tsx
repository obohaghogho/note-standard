import { useNavigate } from 'react-router-dom';
import { ArrowLeft, FileText, CheckCircle, Shield, AlertTriangle } from 'lucide-react';
import { Card } from '../components/common/Card';

export const TermsPage = () => {
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
                                <FileText className="w-8 h-8 text-primary" />
                            </div>
                            <h1 className="text-4xl md:text-5xl font-bold text-white tracking-tight">Terms of Service</h1>
                        </div>
                        <p className="text-xl text-primary/80 font-medium ml-[68px]">Aghogho Plyboard Enterprise</p>
                    </div>

                    <div className="space-y-12 text-gray-300">
                        <section className="relative">
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-3">
                                <CheckCircle className="w-6 h-6 text-primary" />
                                Engagement & Agreement
                            </h2>
                            <p className="leading-relaxed text-lg ml-9">
                                By engaging with our services, you agree to the following terms:
                            </p>
                        </section>

                        <section className="relative">
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-3">
                                <Shield className="w-6 h-6 text-primary" />
                                Key Terms
                            </h2>
                            <div className="ml-9">
                                <ul className="list-none space-y-3">
                                    <li className="flex items-center gap-4 bg-white/[0.03] p-4 rounded-xl border border-white/5 transition-all hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg hover:shadow-primary/5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_rgba(168,85,247,0.8)] ring-4 ring-primary/20"></div>
                                        <span className="text-lg font-medium">All payments must be made through approved channels</span>
                                    </li>
                                    <li className="flex items-center gap-4 bg-white/[0.03] p-4 rounded-xl border border-white/5 transition-all hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg hover:shadow-primary/5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_rgba(168,85,247,0.8)] ring-4 ring-primary/20"></div>
                                        <span className="text-lg font-medium">Customers must provide accurate information</span>
                                    </li>
                                    <li className="flex items-center gap-4 bg-white/[0.03] p-4 rounded-xl border border-white/5 transition-all hover:bg-white/[0.06] hover:border-white/10 hover:shadow-lg hover:shadow-primary/5">
                                        <div className="w-2.5 h-2.5 rounded-full bg-primary shadow-[0_0_10px_rgba(168,85,247,0.8)] ring-4 ring-primary/20"></div>
                                        <span className="text-lg font-medium">We reserve the right to refuse service in cases of fraud or misuse</span>
                                    </li>
                                </ul>
                            </div>
                        </section>

                        <section className="relative">
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-3">
                                <AlertTriangle className="w-6 h-6 text-primary" />
                                Liability Overview
                            </h2>
                            <div className="ml-9 space-y-4">
                                <p className="leading-relaxed text-lg">
                                    We are not liable for delays caused by third-party services.
                                </p>
                            </div>
                        </section>

                        <div className="mt-12 pt-8 border-t border-white/5 bg-gradient-to-b from-transparent to-white/[0.02] -mx-8 -mb-8 px-8 pb-8 md:-mx-12 md:-mb-12 md:px-12 md:pb-12">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 pt-2">
                                <div className="space-y-1">
                                    <p className="text-sm text-gray-400 font-medium uppercase tracking-wider">Contact Us</p>
                                    <p className="text-gray-300">For inquiries, contact:</p>
                                    <a href="mailto:admin@notestandard.com" className="inline-block text-xl text-primary hover:text-white font-semibold transition-colors mt-1">
                                        admin@notestandard.com
                                    </a>
                                </div>
                                <div className="text-left sm:text-right space-y-1">
                                    <p className="text-sm text-gray-400 font-medium uppercase tracking-wider">Last Updated</p>
                                    <p className="text-white text-lg font-medium">01/04/2026</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default TermsPage;
