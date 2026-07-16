import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Info, CheckCircle, Shield, Globe } from 'lucide-react';
import { Card } from '../components/common/Card';
import { SEO } from '../components/common/SEO';

export const AboutPage = () => {
    const navigate = useNavigate();

    return (
        <div className="h-full overflow-y-auto min-h-[100dvh] bg-[#0a0a0a] p-4 md:p-8 relative w-full max-w-full">
            <SEO 
                title="About Us"
                description="Learn about Jossy Digital Technologies Ltd and our commitment to providing simple and reliable real-time messaging and social communication solutions."
            />
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
                            <Info className="w-8 h-8 text-primary" />
                        </div>
                        <h1 className="text-4xl font-bold">About Note Standard</h1>
                    </div>

                    <div className="space-y-10 text-gray-300">
                        <section>
                            <p className="leading-relaxed text-lg mb-4">
                                Jossy Digital Technologies Ltd develops mobile applications for public use, providing secure real-time messaging and social communication solutions that are accessible and user-friendly for businesses and consumers.
                            </p>
                            <p className="leading-relaxed text-gray-400">
                                Our team develops applications focusing on instant connectivity, high-quality audio/video calling, and seamless user experience. We design platforms that serve businesses and individuals globally.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <CheckCircle className="w-6 h-6 text-primary" />
                                Our Goal
                            </h2>
                            <p className="leading-relaxed">
                                Our goal is to create simple and reliable software solutions that help users connect and communicate globally without barriers.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Globe className="w-6 h-6 text-primary" />
                                Our Platform
                            </h2>
                            <p className="leading-relaxed">
                                Through NoteStandard, users can access secure messaging, share media, and participate in high-quality audio and video calls, designed to support global interactions and productivity.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Shield className="w-6 h-6 text-primary" />
                                Our Commitment
                            </h2>
                            <p className="leading-relaxed">
                                We are committed to maintaining a secure environment and delivering consistent technology services through our web and mobile platforms.
                            </p>
                        </section>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default AboutPage;
