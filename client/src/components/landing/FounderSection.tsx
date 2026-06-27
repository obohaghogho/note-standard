import { Instagram, Facebook, Rocket, MessageCircle, Globe, Link as LinkIcon, User } from 'lucide-react';
import { motion } from 'framer-motion';

export const FounderSection = () => {
    return (
        <section className="py-24 relative overflow-hidden bg-black/40 border-t border-white/5">
            {/* Background elements */}
            <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
            <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-[100px] pointer-events-none" />
            
            <div className="max-w-7xl mx-auto px-6 relative z-10">
                <div className="text-center mb-16">
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-sm font-medium mb-6"
                    >
                        <User className="w-4 h-4" />
                        Meet the Founder
                    </motion.div>
                    <motion.h2 
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.1 }}
                        className="text-3xl md:text-5xl font-bold mb-6"
                    >
                        Building the Next <br/> <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-secondary">Social Platform</span>
                    </motion.h2>
                </div>

                <div className="max-w-3xl mx-auto">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        transition={{ delay: 0.2 }}
                        className="glass-panel p-8 md:p-12 rounded-3xl relative overflow-hidden group border border-white/10 bg-white/5 backdrop-blur-md"
                    >
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                        
                        <div className="flex flex-col md:flex-row gap-8 items-center md:items-start relative z-10">
                            {/* Profile Image placeholder */}
                            <div className="w-32 h-32 md:w-40 md:h-40 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 p-1 flex-shrink-0">
                                <div className="w-full h-full rounded-full bg-[#111] border border-white/10 flex items-center justify-center text-5xl overflow-hidden">
                                    👨‍💻
                                </div>
                            </div>

                            <div className="flex-1 text-center md:text-left">
                                <h3 className="text-2xl font-bold text-white mb-1">Oboh Aghogho Jossy</h3>
                                <p className="text-primary font-medium mb-4">Web Designer & Founder @ Note-Standard</p>
                                
                                <div className="grid sm:grid-cols-2 gap-3 mb-6">
                                    <div className="flex items-center gap-2 text-sm text-gray-300">
                                        <Rocket className="w-4 h-4 text-primary" />
                                        <span>Building Note-Standard</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-gray-300">
                                        <div className="w-4 h-4 flex items-center justify-center text-xs">📝</div>
                                        <span>Create Notes</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-gray-300">
                                        <MessageCircle className="w-4 h-4 text-blue-400" />
                                        <span>Chat with Friends</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-gray-300">
                                        <Globe className="w-4 h-4 text-green-400" />
                                        <span>Connect & Collaborate</span>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-4">
                                    <a 
                                        href="https://instagram.com/still_sixboy" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:scale-105 text-sm font-medium"
                                    >
                                        <Instagram className="w-4 h-4 text-pink-500" />
                                        @still_sixboy
                                    </a>
                                    <a 
                                        href="https://facebook.com/search/top?q=oboh%20aghogho%20jossy" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:scale-105 text-sm font-medium"
                                    >
                                        <Facebook className="w-4 h-4 text-blue-500" />
                                        Facebook
                                    </a>
                                    <a 
                                        href="https://www.tiktok.com/@saint.jossy" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:scale-105 text-sm font-medium"
                                    >
                                        {/* TikTok SVG logo */}
                                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                            <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.76a4.85 4.85 0 0 1-1.01-.07z" />
                                        </svg>
                                        @saint.jossy
                                    </a>
                                    <a 
                                        href="https://notestandard.com" 
                                        target="_blank" 
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:scale-105 text-sm font-medium"
                                    >
                                        <LinkIcon className="w-4 h-4 text-gray-400" />
                                        notestandard.com
                                    </a>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </div>
            </div>
        </section>
    );
};
