import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Zap, Globe } from 'lucide-react';

export const Hero = () => {
    return (
        <section className="relative min-h-[100dvh] flex items-center justify-center pt-24 overflow-hidden">
            {/* Background gradients */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-[800px] h-[500px] bg-primary/20 rounded-full blur-[120px] -z-10" />
            <div className="absolute bottom-0 right-0 w-full max-w-[600px] h-[500px] bg-purple-500/10 rounded-full blur-[100px] -z-10" />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-sm mb-6">
                        <span className="flex h-2 w-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="text-gray-400">v2.0 is now live</span>
                    </div>

                    <h1 className="text-xl sm:text-5xl lg:text-7xl font-bold leading-tight mb-6">
                        Notes for the <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">Modern Team</span>
                    </h1>

                    <p className="text-base sm:text-xl text-gray-400 mb-8 max-w-lg leading-relaxed">
                        Secure, fast, and beautiful note-taking designed for high-performance teams.
                        Experience the next evolution of productivity.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <Link to="/signup" className="px-8 py-4 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 group">
                            Start for free
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <button 
                            onClick={() => {
                                console.log('[Hero] View Demo clicked');
                                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/10 text-white rounded-xl font-medium transition-all backdrop-blur-md"
                        >
                            View Demo
                        </button>
                    </div>

                    <div className="mt-8 sm:mt-12 flex flex-wrap items-center gap-4 sm:gap-8 text-gray-500">
                        <div className="flex items-center gap-2">
                            <Shield className="w-5 h-5" />
                            <span className="text-sm">E2E Encrypted</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Zap className="w-5 h-5" />
                            <span className="text-sm">Lightning Fast</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Globe className="w-5 h-5" />
                            <span className="text-sm">Global Sync</span>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, delay: 0.2 }}
                    className="relative hidden lg:block"
                >
                    {/* Main Interface Mockup */}
                    <div className="relative z-10 rounded-2xl border border-white/10 bg-[#121212]/80 backdrop-blur-2xl shadow-2xl overflow-hidden aspect-[4/3] transform skew-y-6 hover:skew-y-3 transition-transform duration-700">
                        {/* Header */}
                        <div className="h-12 border-b border-white/10 bg-white/5 flex items-center px-4 gap-2">
                            <div className="flex gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-500/20 text-red-500 flex items-center justify-center"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-500/20 text-yellow-500 flex items-center justify-center"></div>
                                <div className="w-3 h-3 rounded-full bg-green-500/20 text-green-500 flex items-center justify-center"></div>
                            </div>
                        </div>
                        {/* Content Mock */}
                        <div className="p-6">
                            <div className="h-8 w-3/4 bg-white/5 rounded-lg mb-4 animate-pulse" />
                            <div className="space-y-3">
                                <div className="h-4 w-full bg-white/5 rounded animate-pulse" />
                                <div className="h-4 w-5/6 bg-white/5 rounded animate-pulse" />
                                <div className="h-4 w-4/6 bg-white/5 rounded animate-pulse" />
                            </div>
                            <div className="mt-8 grid grid-cols-2 gap-4">
                                <div className="h-24 rounded-lg bg-primary/10 border border-primary/20 p-4">
                                    <div className="h-8 w-8 rounded bg-primary/20 mb-2" />
                                    <div className="h-3 w-20 bg-primary/20 rounded" />
                                </div>
                                <div className="h-24 rounded-lg bg-white/5 border border-white/10 p-4">
                                    <div className="h-8 w-8 rounded bg-white/10 mb-2" />
                                    <div className="h-3 w-20 bg-white/10 rounded" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Floating Elements */}
                    <motion.div
                        animate={{ y: [-10, 10, -10] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute -top-10 -right-10 z-20 p-4 rounded-xl bg-[#1A1A1A] border border-white/10 shadow-xl"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-green-500/20 flex items-center justify-center text-green-400">
                                $
                            </div>
                            <div>
                                <div className="text-sm font-bold text-white">Payment Rec'd</div>
                                <div className="text-xs text-gray-400">Just now</div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            </div>
        </section>
    );
};
