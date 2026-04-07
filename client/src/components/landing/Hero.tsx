import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Shield, Zap, Globe, Diamond } from 'lucide-react';

export const Hero = () => {
    return (
        <section className="relative min-h-[100dvh] flex items-center justify-center pt-24">
            {/* Crystal Shards Background - VIVID MOD */}
            <motion.div
                animate={{ y: [-30, 30, -30], rotate: [0, 8, 0] }}
                transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
                className="crystal-shape bg-emerald-400/20"
                style={{
                    width: '400px', height: '500px',
                    left: '-5%', top: '10%',
                    clipPath: 'polygon(50% 0%, 100% 25%, 80% 100%, 20% 100%, 0% 25%)'
                }}
            />
            <motion.div
                animate={{ y: [30, -30, 30], rotate: [0, -12, 0] }}
                transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 0.5 }}
                className="crystal-shape bg-purple-400/30"
                style={{
                    width: '450px', height: '550px',
                    right: '2%', top: '0%',
                    clipPath: 'polygon(50% 0%, 100% 38%, 82% 100%, 18% 100%, 0% 38%)'
                }}
            />
            <motion.div
                animate={{ y: [-20, 20, -20], rotate: [-10, 10, -10] }}
                transition={{ duration: 11, repeat: Infinity, ease: "easeInOut", delay: 1 }}
                className="crystal-shape bg-blue-400/20"
                style={{
                    width: '250px', height: '250px',
                    right: '20%', bottom: '10%',
                    clipPath: 'polygon(25% 0%, 75% 0%, 100% 50%, 75% 100%, 25% 100%, 0% 50%)'
                }}
            />

            <div className="max-w-7xl mx-auto px-4 sm:px-6 grid lg:grid-cols-2 gap-12 items-center relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6 }}
                >
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/20 text-sm mb-6 backdrop-blur-md shadow-[0_0_15px_rgba(255,255,255,0.1)]">
                        <Diamond className="w-3.5 h-3.5 text-primary" />
                        <span className="text-gray-200 font-medium tracking-wide">Crystal Theme 2.0 Live</span>
                    </div>

                    <h1 className="text-xl sm:text-4xl lg:text-5xl font-bold leading-tight mb-6">
                        Creating Mobile Apps <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">for Public Use</span> <br />
                        <span className="text-lg sm:text-2xl text-gray-300 font-medium mix-blend-plus-lighter">– Powered by Note Standard</span>
                    </h1>

                    <p className="text-base sm:text-xl text-gray-300/90 mb-8 max-w-lg leading-relaxed">
                        Aghogho Plyboard Enterprise develops premium mobile applications for public use, providing digital solutions that are accessible, crystal-clear, and user-friendly.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-4">
                        <Link to="/signup" className="px-8 py-4 bg-primary hover:bg-primary/90 shadow-[0_0_20px_rgba(16,185,129,0.4)] text-white rounded-xl font-medium transition-all flex items-center justify-center gap-2 group border border-white/10">
                            Start for free
                            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                        </Link>
                        <button 
                            onClick={() => {
                                document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
                            }}
                            className="px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/20 text-white rounded-xl font-medium transition-all backdrop-blur-xl shadow-lg"
                        >
                            View Features
                        </button>
                    </div>

                    <div className="mt-8 sm:mt-12 flex flex-wrap items-center gap-4 sm:gap-8 text-gray-400">
                        <div className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-purple-400" />
                            <span className="text-sm font-medium">E2E Encrypted</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Zap className="w-5 h-5 text-yellow-400" />
                            <span className="text-sm font-medium">Lightning Fast</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Globe className="w-5 h-5 text-blue-400" />
                            <span className="text-sm font-medium">Global Sync</span>
                        </div>
                    </div>
                </motion.div>

                <motion.div
                    initial={{ opacity: 0, scale: 0.9, rotateY: -10 }}
                    animate={{ opacity: 1, scale: 1, rotateY: 0 }}
                    transition={{ duration: 1, delay: 0.2, type: "spring" }}
                    className="relative hidden lg:block perspective-1000"
                >
                    {/* Crystal Interface Mockup */}
                    <div className="crystal-panel rounded-2xl overflow-hidden aspect-[4/3] transform hover:-translate-y-2 hover:rotate-1 transition-all duration-500">
                        {/* Header */}
                        <div className="h-12 border-b border-white/20 bg-white/10 flex items-center px-4 gap-2 backdrop-blur-md">
                            <div className="flex gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-400/80 shadow-[0_0_5px_rgba(248,113,113,0.5)]"></div>
                                <div className="w-3 h-3 rounded-full bg-yellow-400/80 shadow-[0_0_5px_rgba(250,204,21,0.5)]"></div>
                                <div className="w-3 h-3 rounded-full bg-green-400/80 shadow-[0_0_5px_rgba(74,222,128,0.5)]"></div>
                            </div>
                            <div className="ml-4 px-3 py-1 rounded bg-black/20 border border-white/5 text-[10px] text-white/50 tracking-widest font-mono">
                                NOTESTANDARD.COM
                            </div>
                        </div>
                        {/* Content Mock */}
                        <div className="p-6 relative">
                            {/* Inner refraction lines */}
                            <div className="absolute inset-0 bg-gradient-to-tr from-white/5 to-transparent pointer-events-none" />
                            
                            <div className="h-8 w-3/4 bg-white/10 rounded-lg mb-4 shadow-inner" />
                            <div className="space-y-3">
                                <div className="h-4 w-full bg-white/10 rounded shadow-inner" />
                                <div className="h-4 w-5/6 bg-white/10 rounded shadow-inner" />
                                <div className="h-4 w-4/6 bg-white/10 rounded shadow-inner" />
                            </div>
                            <div className="mt-8 grid grid-cols-2 gap-4 relative z-10">
                                <div className="h-24 rounded-xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/30 p-4 shadow-[inset_0_0_10px_rgba(255,255,255,0.1)] backdrop-blur-md">
                                    <div className="h-8 w-8 rounded bg-white/20 mb-2 shadow-sm" />
                                    <div className="h-3 w-20 bg-white/20 rounded" />
                                </div>
                                <div className="h-24 rounded-xl bg-white/5 border border-white/10 p-4 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)] backdrop-blur-md">
                                    <div className="h-8 w-8 rounded bg-white/10 mb-2" />
                                    <div className="h-3 w-20 bg-white/10 rounded" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Floating notification element matching crystal theme */}
                    <motion.div
                        animate={{ y: [-10, 10, -10] }}
                        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                        className="absolute -top-6 -right-6 z-20 p-4 rounded-xl bg-black/40 backdrop-blur-2xl border border-white/20 shadow-[0_15px_35px_rgba(0,0,0,0.5),inset_0_0_10px_rgba(255,255,255,0.1)]"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-primary to-cyan-400 flex items-center justify-center text-white shadow-lg">
                                <Diamond className="w-5 h-5" />
                            </div>
                            <div>
                                <div className="text-sm font-bold text-white tracking-wide">Crystal Unlocked</div>
                                <div className="text-xs text-emerald-300">Just now</div>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            </div>
        </section>
    );
};

