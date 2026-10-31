import { motion } from 'framer-motion';
import { Share2, MessageSquare, Video, FileText, Users, Wallet } from 'lucide-react';

const features = [
    {
        icon: Share2,
        title: 'Social Feed & Community',
        description: 'Share updates, post reels, join community discussions, and engage with creators and community members worldwide.'
    },
    {
        icon: MessageSquare,
        title: 'Secure Messaging',
        description: 'Chat using handles, share supported files, send voice notes, and react to messages with encrypted transit.'
    },
    {
        icon: Video,
        title: 'Audio/Video Calls',
        description: 'Connect through real-time WebRTC audio and video calling, engineered for low-latency communication.'
    },
    {
        icon: FileText,
        title: 'Private Notes',
        description: 'Organize private notes with fast full-text search across your saved notes, drafts, and ideas.'
    },
    {
        icon: Users,
        title: 'Team Workspaces',
        description: 'Create teams, collaborate in channels, and share documents on eligible business plans.'
    },
    {
        icon: Wallet,
        title: 'Multi-Currency Wallet',
        description: 'Access multi-currency wallet features for NGN and USD, with dedicated virtual accounts available subject to applicable KYC verification.'
    }
];

export const Features = () => {
    return (
        <section id="features" className="py-12 sm:py-20 relative overflow-hidden w-full">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="text-center mb-10 sm:mb-16 relative z-10">
                    <h2 className="text-2xl sm:text-4xl md:text-5xl font-bold mb-3 sm:mb-6 tracking-tight">Designed for <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]">Power Users</span></h2>
                    <p className="text-sm sm:text-lg text-gray-300 max-w-2xl mx-auto leading-relaxed">
                        Everything you need to capture ideas, collaborate with your team, and stay organized.
                    </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-8 relative z-10">
                    {features.map((feature, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1, type: "spring", stiffness: 50 }}
                            viewport={{ once: true }}
                            className="glass-card p-6 sm:p-8 rounded-2xl sm:rounded-3xl hover:bg-white/10 transition-all duration-300 group cursor-pointer border-white/10 hover:border-white/30 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] hover:-translate-y-1"
                        >
                            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-400/10 border border-primary/20 flex items-center justify-center text-emerald-400 mb-4 sm:mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all flex-shrink-0">
                                <feature.icon className="w-5 h-5 sm:w-6 sm:h-6" />
                            </div>
                            <h3 className="text-lg sm:text-xl font-bold mb-2 sm:mb-3 text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-emerald-400 group-hover:to-cyan-300 transition-all">{feature.title}</h3>
                            <p className="text-xs sm:text-sm text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors">
                                {feature.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
