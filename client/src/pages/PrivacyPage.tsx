import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Shield, Eye, Database, Activity, Lock, Settings, FileText, RefreshCw } from 'lucide-react';
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
                                At NoteStandard, we believe user data should be protected and handled responsibly. Our platform is designed to provide digital tools for managing activities while maintaining transparency and strong security practices.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Database className="w-6 h-6 text-primary" />
                                Information We Collect
                            </h2>
                            <div className="space-y-4">
                                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                                    <h3 className="text-white font-medium mb-2">A. Account Information</h3>
                                    <p className="text-sm">
                                        When users create an account on the Note Standard platform, we may collect basic information such as name, email address, and account preferences. This information is used only to maintain user accounts and provide access to platform features.
                                    </p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                                    <h3 className="text-white font-medium mb-2">B. Platform Usage Data</h3>
                                    <p className="text-sm">
                                        We collect limited technical information related to how users interact with the platform. This may include device information, session activity, and general usage statistics. The information is used to improve the performance, stability, and usability of the platform.
                                    </p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                                    <h3 className="text-white font-medium mb-2">C. Contextual Content and Offers</h3>
                                    <p className="text-sm">
                                        Our platform may display contextual content or recommendations based on the activity within the current session. This process does not involve cross-site tracking or behavioral profiling.
                                    </p>
                                </div>
                                <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                                    <h3 className="text-white font-medium mb-2">D. Security and System Integrity</h3>
                                    <p className="text-sm">
                                        Certain system logs and technical records may be maintained to protect the platform from abuse, maintain service reliability, and detect unusual or harmful activity.
                                    </p>
                                </div>
                            </div>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Activity className="w-6 h-6 text-primary" />
                                How Information Is Used
                            </h2>
                            <p className="mb-4">The information collected may be used for the following purposes:</p>
                            <ul className="list-disc list-inside space-y-2 ml-4">
                                <li>Maintaining and managing user accounts</li>
                                <li>Improving platform functionality and user experience</li>
                                <li>Ensuring system security and service stability</li>
                                <li>Communicating important updates about the platform</li>
                            </ul>
                            <p className="mt-4 text-sm bg-primary/5 p-3 rounded border border-primary/10">
                                We do not sell personal user information to third parties.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Settings className="w-6 h-6 text-primary" />
                                User Controls
                            </h2>
                            <p className="leading-relaxed">
                                Users have the ability to manage certain preferences within their account settings. This may include controlling optional platform features or managing communication preferences.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <Lock className="w-6 h-6 text-primary" />
                                Data Protection
                            </h2>
                            <p className="leading-relaxed">
                                We implement appropriate technical and organizational measures to protect user information from unauthorized access, alteration, or misuse. Access to sensitive information is restricted and monitored.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <FileText className="w-6 h-6 text-primary" />
                                Data Access and Removal
                            </h2>
                            <p className="leading-relaxed">
                                Users may request access to their stored information or request deletion of their account. Requests can be made by contacting our support team using the contact details provided below.
                            </p>
                        </section>

                        <section>
                            <h2 className="text-2xl font-semibold text-white mb-4 flex items-center gap-2">
                                <RefreshCw className="w-6 h-6 text-primary" />
                                Updates to This Policy
                            </h2>
                            <p className="leading-relaxed">
                                This Privacy Policy may be updated periodically to reflect changes to the platform or applicable requirements. The updated version will be published on this page with a revised date.
                            </p>
                        </section>

                        <div className="pt-8 border-t border-white/10">
                            <p className="text-sm text-gray-500">
                                Last updated: February 14, 2026<br />
                                For privacy inquiries: <a href="mailto:privacy@notestandard.com" className="text-primary hover:underline">privacy@notestandard.com</a>
                            </p>
                        </div>
                    </div>
                </Card>
            </div>
        </div>
    );
};
