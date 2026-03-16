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

                <Card variant="glass" className="p-8 md:p-12">
                    <div className="flex items-center gap-4 mb-8">
                        <div className="p-3 bg-primary/10 rounded-xl">
                            <FileText className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="text-4xl font-bold">Terms of Service</h1>
                    </div>
                    
                    <div className="mb-10 p-4 bg-primary/5 border border-primary/20 rounded-xl text-gray-300">
                        <p><strong>Effective Date:</strong> 04/03/2026</p>
                        <p><strong>Company Name:</strong> Aghogho Plyboard Enterprise</p>
                        <p><strong>App Name:</strong> Note Standard</p>
                    </div>

                    <div className="space-y-10 text-gray-300">
                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <CheckCircle className="w-6 h-6 text-primary" />
                                1. Acceptance of Terms
                            </h2>
                            <p className="leading-relaxed">
                                By accessing or using the Note Standard platform, users agree to comply with the terms outlined here.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <FileText className="w-6 h-6 text-primary" />
                                2. Description of Service
                            </h2>
                            <p className="leading-relaxed">
                                Note Standard provides software-based digital tools and applications designed to support online interactions and digital activities.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Shield className="w-6 h-6 text-primary" />
                                3. User Responsibilities
                            </h2>
                            <p className="leading-relaxed">
                                Users are responsible for ensuring that their use of the platform complies with all applicable laws and regulations.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <AlertTriangle className="w-6 h-6 text-primary" />
                                4. Modifications
                            </h2>
                            <p className="leading-relaxed">
                                We reserve the right to update or modify our services and terms when necessary to maintain the quality and security of the platform.
                            </p>
                        </section>

                        <div className="pt-8 border-t border-white/10">
                            <h2 className="text-2xl font-semibold text-white mb-4">5. Contact Information</h2>
                            <div className="space-y-2 text-sm text-gray-400">
                                <p><strong>Company Name:</strong> Aghogho Plyboard Enterprise</p>
                                <p><strong>Email:</strong> <a href="mailto:admin@notestandard.com" className="text-primary hover:underline">admin@notestandard.com</a></p>
                                <p><strong>Business Address:</strong> 12 udu road delta, Nigeria</p>
                            </div>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};
