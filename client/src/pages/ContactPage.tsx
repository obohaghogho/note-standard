import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Building, Info } from 'lucide-react';
import { Card } from '../components/common/Card';

export const ContactPage = () => {
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
                            <Mail className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="text-4xl font-bold">Contact Us</h1>
                    </div>

                    <div className="space-y-10 text-gray-300">
                        <section className="bg-white/5 border border-white/10 rounded-xl p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <Building className="w-6 h-6 text-primary" />
                                <h2 className="text-xl font-semibold text-white">Company Name</h2>
                            </div>
                            <p className="text-lg mb-4 text-white font-medium">
                                Aghogho Plyboard Enterprise
                            </p>
                            
                            <div className="h-px bg-white/10 my-4" />

                            <div className="flex items-center gap-3 mb-4">
                                <Mail className="w-6 h-6 text-primary" />
                                <h2 className="text-xl font-semibold text-white">Email Address</h2>
                            </div>
                            <a 
                                href="mailto:admin@notestandard.com" 
                                className="text-lg text-primary hover:text-primary/80 hover:underline transition-colors block"
                            >
                                admin@notestandard.com
                            </a>
                        </section>

                        <section className="flex gap-4 p-6 bg-primary/5 border border-primary/20 rounded-xl">
                            <Info className="w-6 h-6 text-primary shrink-0" />
                            <p className="leading-relaxed">
                                If you have any questions, feedback, or partnership enquiries regarding our platform or services, please contact us via email and our team will respond as soon as possible.
                            </p>
                        </section>
                    </div>
                </Card>
            </div>
        </div>
    );
};
