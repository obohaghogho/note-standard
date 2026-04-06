import { motion } from 'framer-motion';
import { Lock, Cloud, Users, Zap, Search, Layout } from 'lucide-react';

const features = [
    {
        icon: Lock,
        title: 'Modern Data Protection',
        description: 'Your notes are protected with industry-standard encryption. Private means private.'
    },
    {
        icon: Cloud,
        title: 'Real-time Sync',
        description: 'Switch devices instantly. Your content is always up to date.'
    },
    {
        icon: Users,
        title: 'Team Collaboration',
        description: 'Share notes with username handles. Granular permissions.'
    },
    {
        icon: Zap,
        title: 'Instant Fast',
        description: 'Zero lag. Optimized for speed and performance.'
    },
    {
        icon: Search,
        title: 'Smart Search',
        description: 'Find any note in milliseconds with our fuzzy search engine.'
    },
    {
        icon: Layout,
        title: 'Clean Dashboard',
        description: 'Distraction-free writing environment with markdown support.'
    }
];

export const Features = () => {
    return (
        <section id="features" className="py-20 relative overflow-hidden">
            <div className="max-w-7xl mx-auto px-4 sm:px-6">
                <div className="text-center mb-16 relative z-10">
                    <h2 className="text-3xl md:text-5xl font-bold mb-6">Designed for <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]">Power Users</span></h2>
                    <p className="text-xl text-gray-300 max-w-2xl mx-auto">
                        Everything you need to capture ideas, collaborate with your team, and stay organized.
                    </p>
                </div>

                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 relative z-10">
                    {features.map((feature, idx) => (
                        <motion.div
                            key={idx}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.1, type: "spring", stiffness: 50 }}
                            viewport={{ once: true }}
                            className="glass-card p-8 hover:bg-white/10 transition-all duration-300 group cursor-pointer border-white/10 hover:border-white/30 hover:shadow-[0_0_30px_rgba(16,185,129,0.15)] hover:-translate-y-1"
                        >
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-cyan-400/10 border border-primary/20 flex items-center justify-center text-emerald-400 mb-6 group-hover:scale-110 group-hover:rotate-3 transition-all">
                                <feature.icon className="w-6 h-6" />
                            </div>
                            <h3 className="text-xl font-bold mb-3 text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-emerald-400 group-hover:to-cyan-300 transition-all">{feature.title}</h3>
                            <p className="text-gray-400 leading-relaxed group-hover:text-gray-300 transition-colors">
                                {feature.description}
                            </p>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
